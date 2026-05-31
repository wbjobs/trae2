package com.iot.gateway.event;

import com.iot.gateway.api.service.MessageRouterService;
import com.iot.gateway.cache.OfflineMessageCache;
import com.iot.gateway.common.model.UnifiedMessage;
import com.iot.gateway.session.DeviceSessionManager;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
public class DeviceOnlineEventListener {

    @Autowired
    private OfflineMessageCache offlineMessageCache;

    @Autowired
    private MessageRouterService messageRouterService;

    @Autowired
    private ApplicationEventPublisher eventPublisher;

    @Autowired
    private DeviceSessionManager sessionManager;

    @Async
    @EventListener
    public void onDeviceOnline(DeviceOnlineEvent event) {
        String deviceId = event.getDeviceId();
        if (deviceId == null) {
            return;
        }

        log.info("收到设备上线事件: deviceId={}, 开始补发离线消息", deviceId);

        try {
            int pendingCount = offlineMessageCache.getOfflineMessageCount(deviceId);
            if (pendingCount == 0) {
                log.debug("设备无离线消息: deviceId={}", deviceId);
                return;
            }

            log.info("设备{}有{}条离线消息待补发", deviceId, pendingCount);

            int totalReissued = 0;
            int totalFailed = 0;

            List<UnifiedMessage> messages;
            do {
                messages = offlineMessageCache.getOfflineMessages(deviceId);
                if (messages.isEmpty()) {
                    break;
                }

                for (UnifiedMessage message : messages) {
                    try {
                        boolean isOnline = sessionManager.isOnline(deviceId);
                        if (!isOnline) {
                            log.warn("补发过程中设备离线: deviceId={}, 剩余{}条消息停止补发",
                                    deviceId, messages.size() - messages.indexOf(message));
                            break;
                        }

                        String result = messageRouterService.sendMessage(message);
                        if (result != null) {
                            offlineMessageCache.confirmMessage(deviceId, message.getMessageId(), true, null);
                            totalReissued++;
                            log.debug("补发离线消息成功: deviceId={}, messageId={}",
                                    deviceId, message.getMessageId());
                        } else {
                            offlineMessageCache.confirmMessage(deviceId, message.getMessageId(), false, "发送失败");
                            totalFailed++;
                            log.warn("补发离线消息失败: deviceId={}, messageId={}",
                                    deviceId, message.getMessageId());
                        }

                        Thread.sleep(10);
                    } catch (Exception e) {
                        log.error("补发离线消息异常: deviceId={}, messageId={}",
                                deviceId, message.getMessageId(), e);
                        totalFailed++;
                    }
                }
            } while (!messages.isEmpty());

            log.info("设备{}离线消息补发完成: 成功{}条, 失败{}条",
                    deviceId, totalReissued, totalFailed);

        } catch (Exception e) {
            log.error("处理设备上线事件异常: deviceId={}", deviceId, e);
        }
    }

    public void publishDeviceOnlineEvent(String deviceId) {
        eventPublisher.publishEvent(new DeviceOnlineEvent(this, deviceId));
    }

    public static class DeviceOnlineEvent extends ApplicationEvent {
        private final String deviceId;

        public DeviceOnlineEvent(Object source, String deviceId) {
            super(source);
            this.deviceId = deviceId;
        }

        public String getDeviceId() {
            return deviceId;
        }
    }
}
