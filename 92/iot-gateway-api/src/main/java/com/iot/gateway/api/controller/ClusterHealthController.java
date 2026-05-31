package com.iot.gateway.api.controller;

import com.iot.gateway.common.model.R;
import com.iot.gateway.router.ClusterHealthManager;
import com.iot.gateway.router.ConsistentHashRouter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/cluster")
public class ClusterHealthController {

    @Autowired
    private ClusterHealthManager healthManager;

    @Autowired
    private ConsistentHashRouter consistentHashRouter;

    @GetMapping("/health")
    public R<Map<String, Object>> getClusterHealth() {
        return R.ok(healthManager.getClusterStats());
    }

    @GetMapping("/nodes")
    public R<List<ClusterHealthManager.NodeStatus>> getAllNodes() {
        return R.ok(healthManager.getAllNodeStatus());
    }

    @GetMapping("/node/{nodeId}")
    public R<ClusterHealthManager.NodeStatus> getNodeStatus(@PathVariable String nodeId) {
        ClusterHealthManager.NodeStatus status = healthManager.getNodeStatus(nodeId);
        if (status == null) {
            return R.error("节点不存在: " + nodeId);
        }
        return R.ok(status);
    }

    @GetMapping("/node/healthy/{nodeId}")
    public R<Boolean> isNodeHealthy(@PathVariable String nodeId) {
        return R.ok(healthManager.isNodeHealthy(nodeId));
    }

    @PostMapping("/hash-ring/rebuild")
    public R<Map<String, Object>> rebuildHashRing() {
        long startTime = System.currentTimeMillis();
        consistentHashRouter.rebuildHashRing();
        Map<String, Object> result = new java.util.HashMap<>();
        result.put("virtualNodeCount", consistentHashRouter.getVirtualNodeCount());
        result.put("hashRingSize", consistentHashRouter.getHashRingSize());
        result.put("currentInstanceId", consistentHashRouter.getCurrentInstanceId());
        result.put("costTime", System.currentTimeMillis() - startTime);
        log.info("手动重建哈希环完成, 虚拟节点数: {}", result.get("hashRingSize"));
        return R.ok(result);
    }

    @GetMapping("/hash-ring")
    public R<Map<String, Object>> getHashRingInfo() {
        Map<String, Object> result = new java.util.HashMap<>();
        result.put("virtualNodeCount", consistentHashRouter.getVirtualNodeCount());
        result.put("hashRingSize", consistentHashRouter.getHashRingSize());
        result.put("currentInstanceId", consistentHashRouter.getCurrentInstanceId());
        return R.ok(result);
    }

    @GetMapping("/route/{deviceId}")
    public R<Map<String, Object>> getDeviceRoute(@PathVariable String deviceId) {
        String gateway = consistentHashRouter.getDeviceGateway(deviceId);
        Map<String, Object> result = new java.util.HashMap<>();
        result.put("deviceId", deviceId);
        result.put("gatewayInstanceId", gateway);
        result.put("isLocal", gateway != null && gateway.equals(consistentHashRouter.getCurrentInstanceId()));
        return R.ok(result);
    }

    @PostMapping("/node/register")
    public R<Boolean> registerNode() {
        healthManager.registerNode();
        return R.ok(true);
    }

    @PostMapping("/health/check")
    public R<Map<String, Object>> triggerHealthCheck() {
        healthManager.checkClusterHealth();
        return R.ok(healthManager.getClusterStats());
    }
}
