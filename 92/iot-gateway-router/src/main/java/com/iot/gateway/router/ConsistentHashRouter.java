package com.iot.gateway.router;

import com.iot.gateway.common.constants.CacheConstants;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RScoredSortedSet;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.client.ServiceInstance;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import java.util.SortedMap;
import java.util.TreeMap;

@Slf4j
@Component
public class ConsistentHashRouter {

    private static final int VIRTUAL_NODE_COUNT = 160;

    @Autowired
    private RedissonClient redissonClient;

    @Autowired
    private DiscoveryClient discoveryClient;

    @Value("${spring.application.name:iot-gateway-api}")
    private String serviceName;

    @Value("${spring.cloud.nacos.discovery.metadata.instance-id:${random.uuid}}")
    private String instanceId;

    private final TreeMap<Long, String> hashRing = new TreeMap<>();

    @PostConstruct
    public void init() {
        rebuildHashRing();
    }

    public void rebuildHashRing() {
        hashRing.clear();

        List<ServiceInstance> instances = discoveryClient.getInstances(serviceName);
        for (ServiceInstance instance : instances) {
            String instanceId = instance.getMetadata().get("instance-id");
            if (instanceId == null) {
                instanceId = instance.getHost() + ":" + instance.getPort();
            }
            addNode(instanceId);
        }

        RScoredSortedSet<String> redisRing = redissonClient.getScoredSortedSet(CacheConstants.CONSISTENT_HASH_RING);
        redisRing.clear();
        for (java.util.Map.Entry<Long, String> entry : hashRing.entrySet()) {
            redisRing.add(entry.getKey().doubleValue(), entry.getValue());
        }

        log.info("重构哈希环完成, 节点数: {}, 虚拟节点数: {}", instances.size(), hashRing.size());
    }

    public void addNode(String node) {
        for (int i = 0; i < VIRTUAL_NODE_COUNT; i++) {
            long hash = hash(node + "-" + i);
            hashRing.put(hash, node);
        }
    }

    public void removeNode(String node) {
        hashRing.entrySet().removeIf(entry -> entry.getValue().equals(node));
    }

    public String getNode(String key) {
        if (hashRing.isEmpty()) {
            return null;
        }

        long hash = hash(key);
        SortedMap<Long, String> tailMap = hashRing.tailMap(hash);
        if (tailMap.isEmpty()) {
            return hashRing.get(hashRing.firstKey());
        }
        return tailMap.get(tailMap.firstKey());
    }

    public String getDeviceGateway(String deviceId) {
        return getNode(deviceId);
    }

    private long hash(String key) {
        try {
            MessageDigest md5 = MessageDigest.getInstance("MD5");
            byte[] bytes = md5.digest(key.getBytes(StandardCharsets.UTF_8));
            return ((long) (bytes[0] & 0xFF))
                    | ((long) (bytes[1] & 0xFF) << 8)
                    | ((long) (bytes[2] & 0xFF) << 16)
                    | ((long) (bytes[3] & 0xFF) << 24);
        } catch (NoSuchAlgorithmException e) {
            return key.hashCode() & 0xffffffffL;
        }
    }

    public String getCurrentInstanceId() {
        return instanceId;
    }

    public int getHashRingSize() {
        return hashRing.size();
    }

    public int getVirtualNodeCount() {
        return VIRTUAL_NODE_COUNT;
    }

    public Map<Long, String> getHashRingSnapshot() {
        return new TreeMap<>(hashRing);
    }
}
