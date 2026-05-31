package com.iot.gateway.session;

import com.iot.gateway.common.constants.CacheConstants;
import com.iot.gateway.common.enums.DeviceStatus;
import com.iot.gateway.common.model.DeviceSession;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RLock;
import org.redisson.api.RMap;
import org.redisson.api.RScript;
import org.redisson.api.RedissonClient;
import org.redisson.client.codec.StringCodec;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class DeviceSessionManager {

    private static final String LOCK_PREFIX = "iot:lock:session:";
    private static final long LOCK_WAIT_TIME = 3;
    private static final long LOCK_LEASE_TIME = 10;

    @Autowired
    private RedissonClient redissonClient;

    @Value("${spring.cloud.nacos.discovery.metadata.instance-id:${random.uuid}}")
    private String instanceId;

    public boolean online(DeviceSession session) {
        String deviceId = session.getDeviceId();
        String lockKey = LOCK_PREFIX + deviceId;
        RLock lock = redissonClient.getLock(lockKey);

        try {
            if (!lock.tryLock(LOCK_WAIT_TIME, LOCK_LEASE_TIME, TimeUnit.SECONDS)) {
                log.warn("获取会话锁超时: deviceId={}", deviceId);
                return false;
            }

            try {
                DeviceSession existingSession = getSession(deviceId);

                if (existingSession != null && existingSession.isOnline()) {
                    String existingGateway = existingSession.getGatewayInstance();
                    if (instanceId.equals(existingGateway)) {
                        updateHeartbeatInternal(session);
                        log.debug("设备已在当前实例在线，更新心跳: deviceId={}", deviceId);
                        return true;
                    } else {
                        log.warn("设备已在其他实例在线: deviceId={}, existingInstance={}, newInstance={}",
                                deviceId, existingGateway, instanceId);
                        session.setOnlineTime(existingSession.getOnlineTime());
                    }
                }

                return doOnline(session);

            } finally {
                if (lock.isHeldByCurrentThread()) {
                    lock.unlock();
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("获取会话锁被中断: deviceId={}", deviceId, e);
            return false;
        }
    }

    private boolean doOnline(DeviceSession session) {
        String deviceId = session.getDeviceId();
        long now = System.currentTimeMillis();

        session.setStatus(DeviceStatus.ONLINE);
        session.setGatewayInstance(instanceId);
        if (session.getOnlineTime() == null) {
            session.setOnlineTime(now);
        }
        session.setLastHeartbeat(now);

        String script =
                "local sessionKey = KEYS[1] " +
                "local statusKey = KEYS[2] " +
                "local sessionJson = ARGV[1] " +
                "local expire = tonumber(ARGV[2]) " +
                "local status = ARGV[3] " +
                "redis.call('HSET', sessionKey, 'session', sessionJson) " +
                "redis.call('EXPIRE', sessionKey, expire) " +
                "redis.call('SET', statusKey, status) " +
                "return 1";

        try {
            redissonClient.getScript(StringCodec.INSTANCE).eval(
                    RScript.Mode.READ_WRITE,
                    script,
                    RScript.ReturnType.INTEGER,
                    Lists.newArrayList(
                            CacheConstants.DEVICE_SESSION_PREFIX + deviceId,
                            CacheConstants.DEVICE_STATUS_PREFIX + deviceId
                    ),
                    com.alibaba.fastjson2.JSON.toJSONString(session),
                    String.valueOf(CacheConstants.DEVICE_SESSION_EXPIRE),
                    DeviceStatus.ONLINE.name()
            );

            log.info("设备上线成功: deviceId={}, instance={}, protocol={}",
                    deviceId, instanceId, session.getProtocolType());
            return true;
        } catch (Exception e) {
            log.error("设备上线失败: deviceId={}", deviceId, e);
            return false;
        }
    }

    private void updateHeartbeatInternal(DeviceSession session) {
        DeviceSession existingSession = getSession(session.getDeviceId());
        if (existingSession != null) {
            existingSession.setLastHeartbeat(System.currentTimeMillis());
            existingSession.setClientIp(session.getClientIp());
            existingSession.setClientPort(session.getClientPort());
            existingSession.setSessionId(session.getSessionId());

            String sessionKey = CacheConstants.DEVICE_SESSION_PREFIX + session.getDeviceId();
            RMap<String, DeviceSession> sessionMap = redissonClient.getMap(sessionKey);
            sessionMap.fastPut("session", existingSession);
            sessionMap.expire(CacheConstants.DEVICE_SESSION_EXPIRE, TimeUnit.SECONDS);
        }
    }

    public boolean offline(String deviceId) {
        String lockKey = LOCK_PREFIX + deviceId;
        RLock lock = redissonClient.getLock(lockKey);

        try {
            if (!lock.tryLock(LOCK_WAIT_TIME, LOCK_LEASE_TIME, TimeUnit.SECONDS)) {
                log.warn("获取离线锁超时: deviceId={}", deviceId);
                return false;
            }

            try {
                DeviceSession session = getSession(deviceId);
                if (session == null) {
                    log.debug("会话不存在，无需离线: deviceId={}", deviceId);
                    return true;
                }

                if (!instanceId.equals(session.getGatewayInstance())) {
                    log.warn("设备不在当前实例，不执行离线: deviceId={}, instance={}",
                            deviceId, session.getGatewayInstance());
                    return false;
                }

                session.setStatus(DeviceStatus.OFFLINE);
                session.setOfflineTime(System.currentTimeMillis());

                String script =
                        "local sessionKey = KEYS[1] " +
                        "local statusKey = KEYS[2] " +
                        "local sessionJson = ARGV[1] " +
                        "local status = ARGV[2] " +
                        "redis.call('HSET', sessionKey, 'session', sessionJson) " +
                        "redis.call('SET', statusKey, status) " +
                        "return 1";

                redissonClient.getScript(StringCodec.INSTANCE).eval(
                        RScript.Mode.READ_WRITE,
                        script,
                        RScript.ReturnType.INTEGER,
                        Lists.newArrayList(
                                CacheConstants.DEVICE_SESSION_PREFIX + deviceId,
                                CacheConstants.DEVICE_STATUS_PREFIX + deviceId
                        ),
                        com.alibaba.fastjson2.JSON.toJSONString(session),
                        DeviceStatus.OFFLINE.name()
                );

                log.info("设备离线成功: deviceId={}, instance={}", deviceId, instanceId);
                return true;
            } finally {
                if (lock.isHeldByCurrentThread()) {
                    lock.unlock();
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("获取离线锁被中断: deviceId={}", deviceId, e);
            return false;
        }
    }

    public DeviceSession getSession(String deviceId) {
        String sessionKey = CacheConstants.DEVICE_SESSION_PREFIX + deviceId;
        RMap<String, DeviceSession> sessionMap = redissonClient.getMap(sessionKey);
        return sessionMap.get("session");
    }

    public void updateHeartbeat(String deviceId) {
        String lockKey = LOCK_PREFIX + deviceId;
        RLock lock = redissonClient.getLock(lockKey);

        try {
            if (lock.tryLock(1, 5, TimeUnit.SECONDS)) {
                try {
                    DeviceSession session = getSession(deviceId);
                    if (session != null && instanceId.equals(session.getGatewayInstance())) {
                        session.setLastHeartbeat(System.currentTimeMillis());
                        String sessionKey = CacheConstants.DEVICE_SESSION_PREFIX + deviceId;
                        RMap<String, DeviceSession> sessionMap = redissonClient.getMap(sessionKey);
                        sessionMap.fastPut("session", session);
                        sessionMap.expire(CacheConstants.DEVICE_SESSION_EXPIRE, TimeUnit.SECONDS);
                    }
                } finally {
                    if (lock.isHeldByCurrentThread()) {
                        lock.unlock();
                    }
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    public boolean isOnline(String deviceId) {
        String statusKey = CacheConstants.DEVICE_STATUS_PREFIX + deviceId;
        Object status = redissonClient.getBucket(statusKey).get();
        return DeviceStatus.ONLINE.equals(status);
    }

    public List<DeviceSession> listOnlineSessions() {
        List<DeviceSession> sessions = new ArrayList<>();
        try {
            Iterable<String> keys = redissonClient.getKeys().getKeysByPattern(
                    CacheConstants.DEVICE_STATUS_PREFIX + "*");
            for (String key : keys) {
                Object status = redissonClient.getBucket(key).get();
                if (DeviceStatus.ONLINE.equals(status)) {
                    String deviceId = key.replace(CacheConstants.DEVICE_STATUS_PREFIX, "");
                    DeviceSession session = getSession(deviceId);
                    if (session != null) {
                        sessions.add(session);
                    }
                }
            }
        } catch (Exception e) {
            log.error("获取在线会话列表失败", e);
        }
        return sessions;
    }

    public String getDeviceGateway(String deviceId) {
        DeviceSession session = getSession(deviceId);
        return session != null ? session.getGatewayInstance() : null;
    }

    public List<String> getLocalDeviceIds() {
        List<String> deviceIds = new ArrayList<>();
        try {
            Iterable<String> keys = redissonClient.getKeys().getKeysByPattern(
                    CacheConstants.DEVICE_STATUS_PREFIX + "*");
            for (String key : keys) {
                Object status = redissonClient.getBucket(key).get();
                if (DeviceStatus.ONLINE.equals(status)) {
                    String deviceId = key.replace(CacheConstants.DEVICE_STATUS_PREFIX, "");
                    DeviceSession session = getSession(deviceId);
                    if (session != null && instanceId.equals(session.getGatewayInstance())) {
                        deviceIds.add(deviceId);
                    }
                }
            }
        } catch (Exception e) {
            log.error("获取本地设备列表失败", e);
        }
        return deviceIds;
    }

    private static class Lists {
        public static <T> java.util.List<T> newArrayList(T... elements) {
            java.util.List<T> list = new java.util.ArrayList<>();
            Collections.addAll(list, elements);
            return list;
        }
    }
}
