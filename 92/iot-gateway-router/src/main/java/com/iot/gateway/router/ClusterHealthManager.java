package com.iot.gateway.router;

import com.iot.gateway.common.constants.CacheConstants;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RMap;
import org.redisson.api.RScoredSortedSet;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.client.ServiceInstance;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.net.InetAddress;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

@Slf4j
@Component
public class ClusterHealthManager {

    private static final String HEALTH_CHECK_KEY = "iot:gateway:health:";
    private static final String NODE_STATUS_KEY = "iot:gateway:node:status:";
    private static final int HEALTH_CHECK_INTERVAL_MS = 5000;
    private static final int NODE_TIMEOUT_MS = 15000;
    private static final int GRACEFUL_SHUTDOWN_MS = 30000;

    @Autowired
    private RedissonClient redissonClient;

    @Autowired
    private DiscoveryClient discoveryClient;

    @Autowired
    private ConsistentHashRouter consistentHashRouter;

    @Value("${spring.application.name:iot-gateway-api}")
    private String serviceName;

    @Value("${spring.cloud.nacos.discovery.metadata.instance-id:${random.uuid}}")
    private String instanceId;

    @Value("${server.port:8080}")
    private int serverPort;

    private final Map<String, Long> nodeLastHeartbeat = new ConcurrentHashMap<>();
    private final Map<String, NodeStatus> nodeStatusMap = new ConcurrentHashMap<>();
    private final Set<String> suspectNodes = ConcurrentHashMap.newKeySet();

    private volatile boolean running = false;

    private String localHost;

    @PostConstruct
    public void init() {
        try {
            localHost = InetAddress.getLocalHost().getHostAddress();
        } catch (Exception e) {
            localHost = "127.0.0.1";
        }
        running = true;
        registerNode();
        log.info("集群健康管理器初始化完成, instanceId={}, host={}, port={}",
                instanceId, localHost, serverPort);
    }

    public void registerNode() {
        try {
            String healthKey = HEALTH_CHECK_KEY + instanceId;
            redissonClient.getBucket(healthKey).set(
                    System.currentTimeMillis(), 30, TimeUnit.SECONDS);

            NodeStatus status = new NodeStatus();
            status.setInstanceId(instanceId);
            status.setHost(localHost);
            status.setPort(serverPort);
            status.setStatus(NodeStatus.Status.RUNNING);
            status.setRegisterTime(System.currentTimeMillis());
            status.setLastHeartbeat(System.currentTimeMillis());

            String statusKey = NODE_STATUS_KEY + instanceId;
            redissonClient.getBucket(statusKey).set(status, 1, TimeUnit.HOURS);

            nodeStatusMap.put(instanceId, status);
            log.info("节点注册成功: {}", instanceId);
        } catch (Exception e) {
            log.error("节点注册失败", e);
        }
    }

    @Scheduled(fixedDelay = HEALTH_CHECK_INTERVAL_MS)
    public void sendHeartbeat() {
        if (!running) return;
        try {
            String healthKey = HEALTH_CHECK_KEY + instanceId;
            redissonClient.getBucket(healthKey).set(
                    System.currentTimeMillis(), 30, TimeUnit.SECONDS);

            String statusKey = NODE_STATUS_KEY + instanceId;
            NodeStatus status = nodeStatusMap.get(instanceId);
            if (status != null) {
                status.setLastHeartbeat(System.currentTimeMillis());
                redissonClient.getBucket(statusKey).set(status, 1, TimeUnit.HOURS);
            }
        } catch (Exception e) {
            log.warn("发送心跳失败", e);
        }
    }

    @Scheduled(fixedDelay = HEALTH_CHECK_INTERVAL_MS * 2)
    public void checkClusterHealth() {
        if (!running) return;
        try {
            List<ServiceInstance> instances = discoveryClient.getInstances(serviceName);
            Set<String> registeredInstanceIds = new HashSet<>();

            for (ServiceInstance instance : instances) {
                String id = instance.getMetadata().get("instance-id");
                if (id == null) {
                    id = instance.getHost() + ":" + instance.getPort();
                }
                registeredInstanceIds.add(id);

                long lastHeartbeat = getNodeLastHeartbeat(id);
                nodeLastHeartbeat.put(id, lastHeartbeat);

                checkNodeHealth(id, lastHeartbeat, instance);
            }

            for (Map.Entry<String, Long> entry : nodeLastHeartbeat.entrySet()) {
                String nodeId = entry.getKey();
                if (!registeredInstanceIds.contains(nodeId) && !nodeId.equals(instanceId)) {
                    checkOrphanNode(nodeId, entry.getValue());
                }
            }

        } catch (Exception e) {
            log.warn("集群健康检查异常", e);
        }
    }

    private void checkNodeHealth(String nodeId, long lastHeartbeat, ServiceInstance instance) {
        if (nodeId.equals(instanceId)) {
            return;
        }

        long now = System.currentTimeMillis();
        long elapsed = now - lastHeartbeat;

        NodeStatus status = nodeStatusMap.get(nodeId);
        if (status == null) {
            status = new NodeStatus();
            status.setInstanceId(nodeId);
            status.setHost(instance.getHost());
            status.setPort(instance.getPort());
            status.setRegisterTime(now);
            nodeStatusMap.put(nodeId, status);
        }
        status.setLastHeartbeat(lastHeartbeat);

        if (elapsed > NODE_TIMEOUT_MS) {
            if (!suspectNodes.contains(nodeId)) {
                suspectNodes.add(nodeId);
                status.setStatus(NodeStatus.Status.SUSPECT);
                log.warn("检测到节点心跳超时, 标记为可疑: {}, 已失联{}ms", nodeId, elapsed);
            } else if (elapsed > NODE_TIMEOUT_MS * 2) {
                handleNodeFailure(nodeId, status);
            }
        } else {
            if (suspectNodes.remove(nodeId)) {
                status.setStatus(NodeStatus.Status.RUNNING);
                log.info("节点恢复正常: {}", nodeId);
            }
        }
    }

    private void checkOrphanNode(String nodeId, long lastHeartbeat) {
        long elapsed = System.currentTimeMillis() - lastHeartbeat;
        if (elapsed > GRACEFUL_SHUTDOWN_MS) {
            NodeStatus status = nodeStatusMap.get(nodeId);
            if (status != null && status.getStatus() != NodeStatus.Status.REMOVED) {
                handleNodeFailure(nodeId, status);
            }
            nodeLastHeartbeat.remove(nodeId);
        }
    }

    private void handleNodeFailure(String nodeId, NodeStatus status) {
        try {
            log.warn("检测到节点故障, 开始摘除: {}", nodeId);

            status.setStatus(NodeStatus.Status.FAILED);
            status.setFailTime(System.currentTimeMillis());

            transferNodeSessions(nodeId);

            consistentHashRouter.removeNode(nodeId);
            consistentHashRouter.rebuildHashRing();

            status.setStatus(NodeStatus.Status.REMOVED);
            status.setRemoveTime(System.currentTimeMillis());

            String statusKey = NODE_STATUS_KEY + nodeId;
            redissonClient.getBucket(statusKey).set(status, 1, TimeUnit.HOURS);

            redissonClient.getBucket(HEALTH_CHECK_KEY + nodeId).delete();

            suspectNodes.remove(nodeId);

            log.info("节点摘除完成: {}, 会话已迁移至其他节点", nodeId);

        } catch (Exception e) {
            log.error("节点摘除失败: {}", nodeId, e);
        }
    }

    private void transferNodeSessions(String failedNodeId) {
        try {
            String sessionPattern = CacheConstants.SESSION_PREFIX + "*";
            RScoredSortedSet<String> sessionSet = redissonClient.getScoredSortedSet(
                    CacheConstants.DEVICE_SESSION_SET);

            Set<String> affectedDevices = new HashSet<>();
            Map<String, Long> statusMap = new HashMap<>();

            for (String sessionKey : redissonClient.getKeys().getKeysByPattern(sessionPattern, 1000)) {
                RMap<Object, Object> sessionData = redissonClient.getMap(sessionKey);
                Object gatewayInstance = sessionData.get("gatewayInstance");
                if (gatewayInstance != null && gatewayInstance.toString().equals(failedNodeId)) {
                    String deviceId = sessionKey.substring(CacheConstants.SESSION_PREFIX.length());
                    affectedDevices.add(deviceId);
                }
            }

            for (String statusKey : redissonClient.getKeys().getKeysByPattern(
                    CacheConstants.STATUS_PREFIX + "*", 1000)) {
                Object status = redissonClient.getBucket(statusKey).get();
                String deviceId = statusKey.substring(CacheConstants.STATUS_PREFIX.length());
                if (status != null && "ONLINE".equals(status.toString())) {
                    statusMap.put(deviceId, System.currentTimeMillis());
                }
            }

            int transferred = 0;
            for (String deviceId : affectedDevices) {
                try {
                    String newNodeId = consistentHashRouter.getDeviceGateway(deviceId);
                    if (newNodeId != null && !newNodeId.equals(failedNodeId)) {
                        String sessionKey = CacheConstants.SESSION_PREFIX + deviceId;
                        RMap<Object, Object> sessionData = redissonClient.getMap(sessionKey);
                        sessionData.put("gatewayInstance", newNodeId);
                        sessionData.put("migratedFrom", failedNodeId);
                        sessionData.put("migrateTime", String.valueOf(System.currentTimeMillis()));

                        log.debug("设备会话迁移: deviceId={}, {} -> {}",
                                deviceId, failedNodeId, newNodeId);
                        transferred++;
                    }
                } catch (Exception e) {
                    log.warn("设备会话迁移失败: {}", deviceId, e);
                }
            }

            log.info("节点{}会话迁移完成, 受影响设备{}台, 已迁移{}台",
                    failedNodeId, affectedDevices.size(), transferred);

        } catch (Exception e) {
            log.error("节点会话迁移异常", e);
        }
    }

    private long getNodeLastHeartbeat(String nodeId) {
        try {
            String healthKey = HEALTH_CHECK_KEY + nodeId;
            Object value = redissonClient.getBucket(healthKey).get();
            if (value instanceof Number) {
                return ((Number) value).longValue();
            }
        } catch (Exception e) {
            log.debug("获取节点心跳失败: {}", nodeId, e);
        }
        return System.currentTimeMillis();
    }

    public List<NodeStatus> getAllNodeStatus() {
        List<NodeStatus> result = new ArrayList<>();
        for (NodeStatus status : nodeStatusMap.values()) {
            result.add(status.copy());
        }
        return result;
    }

    public NodeStatus getNodeStatus(String nodeId) {
        NodeStatus status = nodeStatusMap.get(nodeId);
        return status != null ? status.copy() : null;
    }

    public boolean isNodeHealthy(String nodeId) {
        if (nodeId.equals(instanceId)) {
            return true;
        }
        if (suspectNodes.contains(nodeId)) {
            return false;
        }
        long lastBeat = nodeLastHeartbeat.getOrDefault(nodeId, 0L);
        return System.currentTimeMillis() - lastBeat < NODE_TIMEOUT_MS;
    }

    public Map<String, Object> getClusterStats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("totalNodes", nodeStatusMap.size());
        stats.put("healthyNodes", (int) nodeStatusMap.values().stream()
                .filter(s -> s.getStatus() == NodeStatus.Status.RUNNING).count());
        stats.put("suspectNodes", suspectNodes.size());
        stats.put("failedNodes", (int) nodeStatusMap.values().stream()
                .filter(s -> s.getStatus() == NodeStatus.Status.FAILED
                        || s.getStatus() == NodeStatus.Status.REMOVED).count());
        stats.put("localNodeId", instanceId);
        stats.put("hashRingSize", consistentHashRouter.getHashRingSize());
        return stats;
    }

    public void shutdown() {
        running = false;
        try {
            String statusKey = NODE_STATUS_KEY + instanceId;
            NodeStatus status = nodeStatusMap.get(instanceId);
            if (status != null) {
                status.setStatus(NodeStatus.Status.SHUTTING_DOWN);
                redissonClient.getBucket(statusKey).set(status, 5, TimeUnit.MINUTES);
            }
            log.info("集群管理器已关闭, 节点: {}", instanceId);
        } catch (Exception e) {
            log.error("关闭集群管理器异常", e);
        }
    }

    @lombok.Data
    public static class NodeStatus implements java.io.Serializable {
        private String instanceId;
        private String host;
        private int port;
        private Status status;
        private long registerTime;
        private long lastHeartbeat;
        private long failTime;
        private long removeTime;

        public enum Status {
            RUNNING,
            SUSPECT,
            FAILED,
            REMOVED,
            SHUTTING_DOWN
        }

        public NodeStatus copy() {
            NodeStatus copy = new NodeStatus();
            copy.instanceId = this.instanceId;
            copy.host = this.host;
            copy.port = this.port;
            copy.status = this.status;
            copy.registerTime = this.registerTime;
            copy.lastHeartbeat = this.lastHeartbeat;
            copy.failTime = this.failTime;
            copy.removeTime = this.removeTime;
            return copy;
        }
    }
}
