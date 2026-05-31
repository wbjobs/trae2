package com.iot.gateway.codec;

import com.iot.gateway.common.constants.CacheConstants;
import com.iot.gateway.common.enums.ProtocolType;
import com.iot.gateway.common.model.ProtocolVersion;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RMap;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantReadWriteLock;

@Slf4j
@Component
public class ProtocolVersionManager {

    private static final String PROTOCOL_VERSION_CACHE = "iot:protocol:version:";
    private static final String DEFAULT_VERSION_KEY = "default";
    private static final String ENABLED_VERSIONS_KEY = "enabled";

    @Autowired
    private RedissonClient redissonClient;

    @Autowired
    private ApplicationContext applicationContext;

    private final Map<ProtocolType, Map<String, VersionedMessageCodec>> codecRegistry = new ConcurrentHashMap<>();
    private final Map<ProtocolType, String> defaultVersions = new ConcurrentHashMap<>();
    private final Map<ProtocolType, Set<String>> enabledVersions = new ConcurrentHashMap<>();
    private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();

    @Autowired(required = false)
    private List<VersionedMessageCodec> versionedCodecs;

    @PostConstruct
    public void init() {
        if (versionedCodecs != null) {
            for (VersionedMessageCodec codec : versionedCodecs) {
                registerCodec(codec);
            }
        }
        loadVersionsFromCache();
        log.info("协议版本管理器初始化完成, 已注册协议: {}, 默认版本: {}",
                codecRegistry.keySet(), defaultVersions);
    }

    public void registerCodec(VersionedMessageCodec codec) {
        lock.writeLock().lock();
        try {
            ProtocolType protocolType = codec.getProtocolType();
            String version = codec.getVersion();

            codecRegistry.computeIfAbsent(protocolType, k -> new ConcurrentHashMap<>())
                    .put(version, codec);

            enabledVersions.computeIfAbsent(protocolType, k -> ConcurrentHashMap.newKeySet())
                    .add(version);

            if (defaultVersions.get(protocolType) == null) {
                defaultVersions.put(protocolType, version);
            }

            log.info("注册协议编解码器: {} v{}", protocolType, version);
        } finally {
            lock.writeLock().unlock();
        }
    }

    public boolean switchVersion(ProtocolType protocolType, String version) {
        lock.writeLock().lock();
        try {
            Map<String, VersionedMessageCodec> versions = codecRegistry.get(protocolType);
            if (versions == null || !versions.containsKey(version)) {
                log.warn("协议版本不存在: {} v{}", protocolType, version);
                return false;
            }

            if (!enabledVersions.getOrDefault(protocolType, Collections.emptySet()).contains(version)) {
                log.warn("协议版本未启用: {} v{}", protocolType, version);
                return false;
            }

            defaultVersions.put(protocolType, version);

            RMap<String, String> versionCache = redissonClient.getMap(PROTOCOL_VERSION_CACHE + protocolType);
            versionCache.fastPut(DEFAULT_VERSION_KEY, version);

            log.info("协议版本切换成功: {} -> v{}", protocolType, version);
            return true;
        } finally {
            lock.writeLock().unlock();
        }
    }

    public MessageCodec getCodec(ProtocolType protocolType) {
        return getCodec(protocolType, null);
    }

    public MessageCodec getCodec(ProtocolType protocolType, String version) {
        lock.readLock().lock();
        try {
            Map<String, VersionedMessageCodec> versions = codecRegistry.get(protocolType);
            if (versions == null || versions.isEmpty()) {
                log.warn("协议类型未注册: {}", protocolType);
                return null;
            }

            String targetVersion = version;
            if (targetVersion == null) {
                targetVersion = defaultVersions.get(protocolType);
            }

            VersionedMessageCodec codec = versions.get(targetVersion);
            if (codec == null) {
                String defaultVersion = defaultVersions.get(protocolType);
                codec = versions.get(defaultVersion);
                log.warn("协议版本不存在, 使用默认版本: {} v{} -> v{}",
                        protocolType, version, defaultVersion);
            }

            return codec;
        } finally {
            lock.readLock().unlock();
        }
    }

    public List<ProtocolVersion> listVersions(ProtocolType protocolType) {
        lock.readLock().lock();
        try {
            List<ProtocolVersion> versions = new ArrayList<>();
            Map<String, VersionedMessageCodec> codecs = codecRegistry.get(protocolType);
            if (codecs == null) {
                return versions;
            }

            String defaultVersion = defaultVersions.get(protocolType);
            Set<String> enabled = enabledVersions.getOrDefault(protocolType, Collections.emptySet());

            for (Map.Entry<String, VersionedMessageCodec> entry : codecs.entrySet()) {
                ProtocolVersion pv = new ProtocolVersion();
                pv.setProtocolType(protocolType);
                pv.setVersion(entry.getKey());
                pv.setVersionName(entry.getKey());
                pv.setCodecClassName(entry.getValue().getClass().getName());
                pv.setIsDefault(entry.getKey().equals(defaultVersion));
                pv.setIsEnabled(enabled.contains(entry.getKey()));
                versions.add(pv);
            }

            return versions;
        } finally {
            lock.readLock().unlock();
        }
    }

    public boolean enableVersion(ProtocolType protocolType, String version, boolean enable) {
        lock.writeLock().lock();
        try {
            Map<String, VersionedMessageCodec> versions = codecRegistry.get(protocolType);
            if (versions == null || !versions.containsKey(version)) {
                return false;
            }

            Set<String> enabled = enabledVersions.computeIfAbsent(protocolType,
                    k -> ConcurrentHashMap.newKeySet());

            if (enable) {
                enabled.add(version);
            } else {
                if (version.equals(defaultVersions.get(protocolType))) {
                    log.warn("无法禁用默认版本: {} v{}", protocolType, version);
                    return false;
                }
                enabled.remove(version);
            }

            RMap<String, String> versionCache = redissonClient.getMap(PROTOCOL_VERSION_CACHE + protocolType);
            versionCache.fastPut(ENABLED_VERSIONS_KEY, String.join(",", enabled));

            log.info("协议版本{}: {} v{}", enable ? "启用" : "禁用", protocolType, version);
            return true;
        } finally {
            lock.writeLock().unlock();
        }
    }

    public String getCurrentVersion(ProtocolType protocolType) {
        lock.readLock().lock();
        try {
            return defaultVersions.get(protocolType);
        } finally {
            lock.readLock().unlock();
        }
    }

    private void loadVersionsFromCache() {
        for (ProtocolType protocolType : codecRegistry.keySet()) {
            try {
                RMap<String, String> versionCache = redissonClient.getMap(PROTOCOL_VERSION_CACHE + protocolType);
                String cachedDefault = versionCache.get(DEFAULT_VERSION_KEY);
                if (cachedDefault != null && codecRegistry.get(protocolType).containsKey(cachedDefault)) {
                    defaultVersions.put(protocolType, cachedDefault);
                    log.info("从缓存加载协议默认版本: {} v{}", protocolType, cachedDefault);
                }

                String cachedEnabled = versionCache.get(ENABLED_VERSIONS_KEY);
                if (cachedEnabled != null) {
                    Set<String> enabled = enabledVersions.computeIfAbsent(protocolType,
                            k -> ConcurrentHashMap.newKeySet());
                    enabled.clear();
                    Collections.addAll(enabled, cachedEnabled.split(","));
                }
            } catch (Exception e) {
                log.warn("从缓存加载协议版本失败: {}", protocolType, e);
            }
        }
    }

    public boolean isVersionEnabled(ProtocolType protocolType, String version) {
        lock.readLock().lock();
        try {
            return enabledVersions.getOrDefault(protocolType, Collections.emptySet())
                    .contains(version);
        } finally {
            lock.readLock().unlock();
        }
    }
}
