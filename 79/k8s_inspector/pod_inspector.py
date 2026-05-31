import os
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from kubernetes import client, config
from kubernetes.client.rest import ApiException

logger = logging.getLogger(__name__)


class PodStatus:
    RUNNING = "Running"
    PENDING = "Pending"
    SUCCEEDED = "Succeeded"
    FAILED = "Failed"
    UNKNOWN = "Unknown"
    CRASH_LOOP_BACK_OFF = "CrashLoopBackOff"
    IMAGE_PULL_BACK_OFF = "ImagePullBackOff"
    ERR_IMAGE_PULL = "ErrImagePull"


class PodInspector:
    def __init__(
        self,
        kubeconfig: Optional[str] = None,
        context: Optional[str] = None,
        thresholds: Optional[Dict[str, Any]] = None,
    ):
        self.kubeconfig = kubeconfig or os.path.expanduser("~/.kube/config")
        self.context = context
        self.thresholds = thresholds or {}
        self._config_loaded = False

    def _ensure_config_loaded(self) -> None:
        if self._config_loaded:
            return
        try:
            expanded_kubeconfig = os.path.expanduser(self.kubeconfig)
            if os.path.exists(expanded_kubeconfig):
                config.load_kube_config(
                    config_file=expanded_kubeconfig,
                    context=self.context,
                )
            else:
                config.load_incluster_config()
            logger.info("Kubernetes 配置加载成功")
            self._config_loaded = True
        except Exception as e:
            logger.warning(f"加载 K8s 配置失败: {e}，尝试使用 in-cluster 配置")
            try:
                config.load_incluster_config()
                self._config_loaded = True
            except Exception as e2:
                raise RuntimeError(f"无法加载 K8s 配置: {e2}")

    @staticmethod
    def _get_pod_restart_count(pod) -> int:
        restart_count = 0
        if pod.status.container_statuses:
            for container_status in pod.status.container_statuses:
                restart_count += container_status.restart_count
        return restart_count

    @staticmethod
    def _get_pod_phase(pod) -> str:
        return pod.status.phase or PodStatus.UNKNOWN

    @staticmethod
    def _get_pod_ready_status(pod) -> bool:
        if pod.status.conditions:
            for condition in pod.status.conditions:
                if condition.type == "Ready":
                    return condition.status == "True"
        return False

    @staticmethod
    def _get_container_statuses(pod) -> List[Dict[str, Any]]:
        containers = []
        if pod.status.container_statuses:
            for cs in pod.status.container_statuses:
                state_info = {}
                if cs.state.running:
                    state = "Running"
                    state_info["started_at"] = cs.state.running.started_at.strftime(
                        "%Y-%m-%d %H:%M:%S"
                    ) if cs.state.running.started_at else None
                elif cs.state.waiting:
                    state = cs.state.waiting.reason or "Waiting"
                    state_info["message"] = cs.state.waiting.message
                elif cs.state.terminated:
                    state = cs.state.terminated.reason or "Terminated"
                    state_info["exit_code"] = cs.state.terminated.exit_code
                    state_info["message"] = cs.state.terminated.message
                else:
                    state = "Unknown"

                containers.append(
                    {
                        "name": cs.name,
                        "image": cs.image,
                        "ready": cs.ready,
                        "restart_count": cs.restart_count,
                        "state": state,
                        "state_info": state_info,
                    }
                )
        return containers

    def _get_pod_status_level(
        self, pod_phase: str, restart_count: int, ready: bool
    ) -> str:
        restart_warning = self.thresholds.get("pod_restart_warning", 3)
        restart_critical = self.thresholds.get("pod_restart_critical", 10)

        if pod_phase in [PodStatus.FAILED, PodStatus.CRASH_LOOP_BACK_OFF]:
            return "CRITICAL"
        if restart_count >= restart_critical:
            return "CRITICAL"
        if pod_phase == PodStatus.PENDING or not ready:
            return "WARNING"
        if restart_count >= restart_warning:
            return "WARNING"
        if pod_phase == PodStatus.RUNNING and ready:
            return "NORMAL"
        return "UNKNOWN"

    def inspect_pods(
        self,
        namespaces: Optional[List[str]] = None,
        label_selector: Optional[str] = None,
        field_selector: Optional[str] = None,
    ) -> Dict[str, Any]:
        self._ensure_config_loaded()
        v1 = client.CoreV1Api()
        all_pods: List[Dict[str, Any]] = []
        namespaces_to_check = namespaces or [None]

        for ns in namespaces_to_check:
            try:
                kwargs = {}
                if ns:
                    kwargs["namespace"] = ns
                if label_selector:
                    kwargs["label_selector"] = label_selector
                if field_selector:
                    kwargs["field_selector"] = field_selector

                pods = v1.list_pod_for_all_namespaces(**kwargs) if not ns else v1.list_namespaced_pod(**kwargs)

                for pod in pods.items:
                    pod_phase = self._get_pod_phase(pod)
                    restart_count = self._get_pod_restart_count(pod)
                    ready = self._get_pod_ready_status(pod)
                    status_level = self._get_pod_status_level(pod_phase, restart_count, ready)

                    pod_info = {
                        "namespace": pod.metadata.namespace,
                        "name": pod.metadata.name,
                        "pod_ip": pod.status.pod_ip,
                        "host_ip": pod.status.host_ip,
                        "node_name": pod.spec.node_name,
                        "phase": pod_phase,
                        "restart_count": restart_count,
                        "ready": ready,
                        "status": status_level,
                        "containers": self._get_container_statuses(pod),
                        "labels": pod.metadata.labels or {},
                        "annotations": pod.metadata.annotations or {},
                        "creation_timestamp": pod.metadata.creation_timestamp.strftime(
                            "%Y-%m-%d %H:%M:%S"
                        ) if pod.metadata.creation_timestamp else None,
                    }
                    all_pods.append(pod_info)

            except ApiException as e:
                logger.error(f"获取命名空间 {ns} Pod 列表失败: {e}")
            except Exception as e:
                logger.error(f"巡检命名空间 {ns} 时发生错误: {e}")

        summary = self._generate_summary(all_pods)

        return {
            "pods": all_pods,
            "summary": summary,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }

    def _generate_summary(self, pods: List[Dict[str, Any]]) -> Dict[str, Any]:
        total = len(pods)
        normal = sum(1 for p in pods if p["status"] == "NORMAL")
        warning = sum(1 for p in pods if p["status"] == "WARNING")
        critical = sum(1 for p in pods if p["status"] == "CRITICAL")
        unknown = sum(1 for p in pods if p["status"] == "UNKNOWN")

        by_namespace: Dict[str, Dict[str, int]] = {}
        by_node: Dict[str, Dict[str, int]] = {}
        by_phase: Dict[str, int] = {}

        for pod in pods:
            ns = pod["namespace"]
            node = pod.get("node_name") or "unknown"
            phase = pod["phase"]

            if ns not in by_namespace:
                by_namespace[ns] = {"total": 0, "normal": 0, "warning": 0, "critical": 0}
            by_namespace[ns]["total"] += 1
            by_namespace[ns][pod["status"].lower()] += 1

            if node not in by_node:
                by_node[node] = {"total": 0, "normal": 0, "warning": 0, "critical": 0}
            by_node[node]["total"] += 1
            by_node[node][pod["status"].lower()] += 1

            by_phase[phase] = by_phase.get(phase, 0) + 1

        return {
            "total": total,
            "normal": normal,
            "warning": warning,
            "critical": critical,
            "unknown": unknown,
            "by_namespace": by_namespace,
            "by_node": by_node,
            "by_phase": by_phase,
        }

    def inspect_abnormal_pods(
        self, namespaces: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        result = self.inspect_pods(namespaces)
        abnormal_pods = [
            p for p in result["pods"] if p["status"] in ["WARNING", "CRITICAL"]
        ]
        result["pods"] = abnormal_pods
        result["summary"]["total"] = len(abnormal_pods)
        return result
