package com.iot.gateway.cache;

import com.iot.gateway.common.constants.CacheConstants;
import com.iot.gateway.common.model.UnifiedMessage;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RBlockingDeque;
import org.redisson.api.RDelayedQueue;
import org.redisson.api.RMap;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@Service
public class OfflineMessageCache {

    private static final String PENDING_QUEUE_SUFFIX = ":pending";
    private static final String PROCESSING_QUEUE_SUFFIX = ":processing";
    private static final String FAILED_QUEUE_SUFFIX = ":failed";
    private static final String MESSAGE_STATUS_PREFIX = "iot:offline:status:";
    private static final String DEAD_LETTER_QUEUE = "iot:offline:dead-letter";

    private static final int MAX_RETRY_TIMES = 3;
    private static final long RETRY_DELAY_SECONDS = 30;
    private static final int BATCH_SIZE = 50;

    @Autowired
    private RedissonClient redissonClient;

    private final Map<String, AtomicInteger> retryCounter = new ConcurrentHashMap<>();

    public boolean addOfflineMessage(String deviceId, UnifiedMessage message) {
        if (deviceId == null || message == null) {
            log.warn("添加离线消息: 参数为空, deviceId={}", deviceId);
            return false;
        }

        try {
            String pendingQueueKey = CacheConstants.OFFLINE_MESSAGE_PREFIX + deviceId + PENDING_QUEUE_SUFFIX;
            String messageStatusKey = MESSAGE_STATUS_PREFIX + message.getMessageId();

            RBlockingDeque<OfflineMessageWrapper> pendingQueue = redissonClient.getBlockingDeque(pendingQueueKey);

            if (pendingQueue.size() >= CacheConstants.OFFLINE_MESSAGE_MAX_SIZE) {
                OfflineMessageWrapper oldest = pendingQueue.pollFirst();
                if (oldest != null) {
                    moveToDeadLetterQueue(oldest, "队列已满，丢弃最早消息");
                    log.warn("离线消息队列已满, 丢弃最早消息: deviceId={}, messageId={}",
                            deviceId, oldest.getMessage().getMessageId());
                }
            }

            OfflineMessageWrapper wrapper = new OfflineMessageWrapper(message, deviceId);
            boolean result = pendingQueue.offerLast(wrapper, 10, TimeUnit.SECONDS);

            if (result) {
                pendingQueue.expire(CacheConstants.OFFLINE_MESSAGE_EXPIRE, TimeUnit.SECONDS);

                MessageStatus status = new MessageStatus();
                status.setDeviceId(deviceId);
                status.setMessageId(message.getMessageId());
                status.setStatus(MessageStatus.STATUS_PENDING);
                status.setCreateTime(System.currentTimeMillis());
                RMap<String, MessageStatus> statusMap = redissonClient.getMap(messageStatusKey);
                statusMap.fastPut("status", status);
                statusMap.expire(CacheConstants.OFFLINE_MESSAGE_EXPIRE, TimeUnit.SECONDS);

                log.debug("添加离线消息成功: deviceId={}, messageId={}, queueSize={}",
                        deviceId, message.getMessageId(), pendingQueue.size());
            }

            return result;
        } catch (Exception e) {
            log.error("添加离线消息失败: deviceId={}, messageId={}",
                    deviceId, message != null ? message.getMessageId() : null, e);
            return false;
        }
    }

    public List<UnifiedMessage> getOfflineMessages(String deviceId) {
        List<UnifiedMessage> messages = new ArrayList<>();
        if (deviceId == null) {
            return messages;
        }

        try {
            String pendingQueueKey = CacheConstants.OFFLINE_MESSAGE_PREFIX + deviceId + PENDING_QUEUE_SUFFIX;
            String processingQueueKey = CacheConstants.OFFLINE_MESSAGE_PREFIX + deviceId + PROCESSING_QUEUE_SUFFIX;

            RBlockingDeque<OfflineMessageWrapper> pendingQueue = redissonClient.getBlockingDeque(pendingQueueKey);
            RBlockingDeque<OfflineMessageWrapper> processingQueue = redissonClient.getBlockingDeque(processingQueueKey);

            int count = 0;
            while (!pendingQueue.isEmpty() && count < BATCH_SIZE) {
                OfflineMessageWrapper wrapper = pendingQueue.pollFirst(5, TimeUnit.SECONDS);
                if (wrapper != null) {
                    wrapper.setRetryCount(wrapper.getRetryCount() + 1);
                    wrapper.setLastSendTime(System.currentTimeMillis());

                    processingQueue.offerLast(wrapper, 5, TimeUnit.SECONDS);

                    updateMessageStatus(wrapper.getMessage().getMessageId(), MessageStatus.STATUS_PROCESSING, null);

                    messages.add(wrapper.getMessage());
                    count++;
                }
            }

            if (!messages.isEmpty()) {
                processingQueue.expire(CacheConstants.OFFLINE_MESSAGE_EXPIRE, TimeUnit.SECONDS);
                log.info("获取离线消息: deviceId={}, count={}", deviceId, messages.size());
            }
        } catch (Exception e) {
            log.error("获取离线消息失败: deviceId={}", deviceId, e);
        }
        return messages;
    }

    public boolean confirmMessage(String deviceId, String messageId, boolean success, String errorMsg) {
        if (deviceId == null || messageId == null) {
            return false;
        }

        try {
            String processingQueueKey = CacheConstants.OFFLINE_MESSAGE_PREFIX + deviceId + PROCESSING_QUEUE_SUFFIX;
            RBlockingDeque<OfflineMessageWrapper> processingQueue = redissonClient.getBlockingDeque(processingQueueKey);

            OfflineMessageWrapper target = null;
            for (OfflineMessageWrapper wrapper : processingQueue) {
                if (messageId.equals(wrapper.getMessage().getMessageId())) {
                    target = wrapper;
                    break;
                }
            }

            if (target == null) {
                log.warn("确认消息: 消息不在处理队列中, deviceId={}, messageId={}", deviceId, messageId);
                updateMessageStatus(messageId, success ? MessageStatus.STATUS_CONFIRMED : MessageStatus.STATUS_FAILED, errorMsg);
                return true;
            }

            processingQueue.remove(target);

            if (success) {
                updateMessageStatus(messageId, MessageStatus.STATUS_CONFIRMED, null);
                log.debug("消息发送成功确认: deviceId={}, messageId={}", deviceId, messageId);
            } else {
                handleSendFailure(target, errorMsg);
            }

            return true;
        } catch (Exception e) {
            log.error("确认消息失败: deviceId={}, messageId={}", deviceId, messageId, e);
            return false;
        }
    }

    private void handleSendFailure(OfflineMessageWrapper wrapper, String errorMsg) {
        String deviceId = wrapper.getDeviceId();
        String messageId = wrapper.getMessage().getMessageId();

        if (wrapper.getRetryCount() >= MAX_RETRY_TIMES) {
            moveToDeadLetterQueue(wrapper, errorMsg);
            updateMessageStatus(messageId, MessageStatus.STATUS_DEAD, errorMsg);
            log.error("消息重试次数超限, 移入死信队列: deviceId={}, messageId={}, retryCount={}",
                    deviceId, messageId, wrapper.getRetryCount());
            return;
        }

        try {
            String pendingQueueKey = CacheConstants.OFFLINE_MESSAGE_PREFIX + deviceId + PENDING_QUEUE_SUFFIX;
            String failedQueueKey = CacheConstants.OFFLINE_MESSAGE_PREFIX + deviceId + FAILED_QUEUE_SUFFIX;

            RBlockingDeque<OfflineMessageWrapper> pendingQueue = redissonClient.getBlockingDeque(pendingQueueKey);
            RBlockingDeque<OfflineMessageWrapper> failedQueue = redissonClient.getBlockingDeque(failedQueueKey);

            wrapper.setLastError(errorMsg);
            failedQueue.offerLast(wrapper);
            failedQueue.expire(CacheConstants.OFFLINE_MESSAGE_EXPIRE, TimeUnit.SECONDS);

            RDelayedQueue<OfflineMessageWrapper> delayedQueue = redissonClient.getDelayedQueue(pendingQueue);
            long delay = RETRY_DELAY_SECONDS * (1L << wrapper.getRetryCount());
            delayedQueue.offer(wrapper, delay, TimeUnit.SECONDS);

            updateMessageStatus(messageId, MessageStatus.STATUS_PENDING,
                    "重试中, 第" + wrapper.getRetryCount() + "次, 错误: " + errorMsg);

            log.warn("消息发送失败, 等待重试: deviceId={}, messageId={}, retryCount={}, delay={}s",
                    deviceId, messageId, wrapper.getRetryCount(), delay);

        } catch (Exception e) {
            log.error("处理失败消息异常: deviceId={}, messageId={}", deviceId, messageId, e);
            moveToDeadLetterQueue(wrapper, errorMsg);
        }
    }

    private void moveToDeadLetterQueue(OfflineMessageWrapper wrapper, String reason) {
        try {
            wrapper.setLastError(reason);
            wrapper.setDeadLetterTime(System.currentTimeMillis());
            RBlockingDeque<OfflineMessageWrapper> deadLetterQueue = redissonClient.getBlockingDeque(DEAD_LETTER_QUEUE);
            deadLetterQueue.offerLast(wrapper);
            deadLetterQueue.expire(CacheConstants.OFFLINE_MESSAGE_EXPIRE * 2, TimeUnit.SECONDS);
        } catch (Exception e) {
            log.error("移入死信队列失败: messageId={}", wrapper.getMessage().getMessageId(), e);
        }
    }

    private void updateMessageStatus(String messageId, int status, String remark) {
        try {
            String statusKey = MESSAGE_STATUS_PREFIX + messageId;
            RMap<String, MessageStatus> statusMap = redissonClient.getMap(statusKey);
            MessageStatus messageStatus = statusMap.get("status");
            if (messageStatus != null) {
                messageStatus.setStatus(status);
                messageStatus.setUpdateTime(System.currentTimeMillis());
                messageStatus.setRemark(remark);
                statusMap.fastPut("status", messageStatus);
            }
        } catch (Exception e) {
            log.debug("更新消息状态失败: messageId={}", messageId, e);
        }
    }

    @Scheduled(fixedDelay = 60000)
    public void retryStuckMessages() {
        try {
            Iterable<String> keys = redissonClient.getKeys().getKeysByPattern(
                    CacheConstants.OFFLINE_MESSAGE_PREFIX + "*" + PROCESSING_QUEUE_SUFFIX);

            long now = System.currentTimeMillis();
            for (String key : keys) {
                RBlockingDeque<OfflineMessageWrapper> processingQueue = redissonClient.getBlockingDeque(key);
                List<OfflineMessageWrapper> toRetry = new ArrayList<>();

                for (OfflineMessageWrapper wrapper : processingQueue) {
                    long stuckTime = now - wrapper.getLastSendTime();
                    if (stuckTime > 60000) {
                        toRetry.add(wrapper);
                    }
                }

                for (OfflineMessageWrapper wrapper : toRetry) {
                    processingQueue.remove(wrapper);
                    handleSendFailure(wrapper, "发送超时, 自动重试");
                    log.warn("处理队列中超时消息重试: deviceId={}, messageId={}, stuckTime={}s",
                            wrapper.getDeviceId(), wrapper.getMessage().getMessageId(), stuckTime / 1000);
                }
            }
        } catch (Exception e) {
            log.error("定时重试卡住消息失败", e);
        }
    }

    public void clearOfflineMessages(String deviceId) {
        try {
            String pendingQueueKey = CacheConstants.OFFLINE_MESSAGE_PREFIX + deviceId + PENDING_QUEUE_SUFFIX;
            String processingQueueKey = CacheConstants.OFFLINE_MESSAGE_PREFIX + deviceId + PROCESSING_QUEUE_SUFFIX;
            String failedQueueKey = CacheConstants.OFFLINE_MESSAGE_PREFIX + deviceId + FAILED_QUEUE_SUFFIX;

            redissonClient.getBlockingDeque(pendingQueueKey).delete();
            redissonClient.getBlockingDeque(processingQueueKey).delete();
            redissonClient.getBlockingDeque(failedQueueKey).delete();

            log.debug("清除离线消息: deviceId={}", deviceId);
        } catch (Exception e) {
            log.error("清除离线消息失败: deviceId={}", deviceId, e);
        }
    }

    public int getOfflineMessageCount(String deviceId) {
        try {
            String pendingQueueKey = CacheConstants.OFFLINE_MESSAGE_PREFIX + deviceId + PENDING_QUEUE_SUFFIX;
            return redissonClient.getBlockingDeque(pendingQueueKey).size();
        } catch (Exception e) {
            log.error("获取离线消息数量失败: deviceId={}", deviceId, e);
            return 0;
        }
    }

    public Map<String, Integer> getMessageStatus(String messageId) {
        try {
            String statusKey = MESSAGE_STATUS_PREFIX + messageId;
            RMap<String, MessageStatus> statusMap = redissonClient.getMap(statusKey);
            MessageStatus status = statusMap.get("status");
            if (status != null) {
                Map<String, Integer> result = new java.util.HashMap<>();
                result.put("status", status.getStatus());
                result.put("retryCount", retryCounter.getOrDefault(messageId, new AtomicInteger(0)).get());
                return result;
            }
        } catch (Exception e) {
            log.debug("获取消息状态失败: messageId={}", messageId, e);
        }
        return null;
    }

    @Data
    public static class OfflineMessageWrapper implements Serializable {
        private static final long serialVersionUID = 1L;
        private UnifiedMessage message;
        private String deviceId;
        private int retryCount;
        private long createTime;
        private long lastSendTime;
        private String lastError;
        private long deadLetterTime;

        public OfflineMessageWrapper() {
        }

        public OfflineMessageWrapper(UnifiedMessage message, String deviceId) {
            this.message = message;
            this.deviceId = deviceId;
            this.retryCount = 0;
            this.createTime = System.currentTimeMillis();
        }
    }

    @Data
    public static class MessageStatus implements Serializable {
        private static final long serialVersionUID = 1L;
        public static final int STATUS_PENDING = 0;
        public static final int STATUS_PROCESSING = 1;
        public static final int STATUS_CONFIRMED = 2;
        public static final int STATUS_FAILED = 3;
        public static final int STATUS_DEAD = 4;

        private String deviceId;
        private String messageId;
        private int status;
        private long createTime;
        private long updateTime;
        private String remark;
    }
}
