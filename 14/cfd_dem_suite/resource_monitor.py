import os
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
from collections import deque
import logging

logger = logging.getLogger(__name__)


@dataclass
class SystemResource:
    cpu_count: int = 0
    cpu_usage: float = 0.0
    cpu_usage_per_core: List[float] = field(default_factory=list)
    total_memory: int = 0
    available_memory: int = 0
    used_memory: int = 0
    memory_percent: float = 0.0
    total_disk: int = 0
    available_disk: int = 0
    used_disk: int = 0
    disk_percent: float = 0.0
    gpu_count: int = 0
    gpu_memory: List[int] = field(default_factory=list)
    gpu_utilization: List[float] = field(default_factory=list)
    network_io: Tuple[int, int] = (0, 0)
    load_avg: Tuple[float, float, float] = (0.0, 0.0, 0.0)


@dataclass
class ProcessResource:
    pid: int
    cpu_percent: float = 0.0
    memory_mb: float = 0.0
    memory_percent: float = 0.0
    num_threads: int = 0
    num_handles: int = 0
    io_read_bytes: int = 0
    io_write_bytes: int = 0
    status: str = "running"


class ResourceMonitor:
    def __init__(self, history_size: int = 100):
        self.history_size = history_size
        self.system_history: deque = deque(maxlen=history_size)
        self.process_history: deque = deque(maxlen=history_size)
        self._psutil_available = False
        
        try:
            import psutil
            self._psutil = psutil
            self._psutil_available = True
        except ImportError:
            logger.warning("psutil not available, limited resource monitoring")
    
    def is_available(self) -> bool:
        return self._psutil_available
    
    def get_system_resources(self) -> SystemResource:
        resource = SystemResource()
        
        if not self._psutil_available:
            return resource
        
        ps = self._psutil
        
        resource.cpu_count = ps.cpu_count(logical=True)
        resource.cpu_usage = ps.cpu_percent(interval=0.1)
        resource.cpu_usage_per_core = ps.cpu_percent(percpu=True)
        
        mem = ps.virtual_memory()
        resource.total_memory = mem.total
        resource.available_memory = mem.available
        resource.used_memory = mem.used
        resource.memory_percent = mem.percent
        
        try:
            disk = ps.disk_usage('/')
            resource.total_disk = disk.total
            resource.available_disk = disk.free
            resource.used_disk = disk.used
            resource.disk_percent = disk.percent
        except:
            pass
        
        resource.gpu_count, gpu_mem, gpu_util = self._get_gpu_info()
        resource.gpu_memory = gpu_mem
        resource.gpu_utilization = gpu_util
        
        try:
            net_io = ps.net_io_counters()
            resource.network_io = (net_io.bytes_sent, net_io.bytes_recv)
        except:
            pass
        
        if hasattr(ps, 'getloadavg'):
            try:
                resource.load_avg = ps.getloadavg()
            except:
                pass
        
        self.system_history.append(resource)
        return resource
    
    def get_process_resources(self, pid: Optional[int] = None) -> ProcessResource:
        if pid is None:
            pid = os.getpid()
        
        proc_res = ProcessResource(pid=pid)
        
        if not self._psutil_available:
            return proc_res
        
        try:
            process = self._psutil.Process(pid)
            
            proc_res.cpu_percent = process.cpu_percent(interval=0.1)
            mem_info = process.memory_info()
            proc_res.memory_mb = mem_info.rss / (1024 * 1024)
            proc_res.memory_percent = process.memory_percent()
            proc_res.num_threads = process.num_threads()
            
            try:
                proc_res.num_handles = process.num_handles()
            except:
                try:
                    proc_res.num_handles = process.num_fds()
                except:
                    pass
            
            try:
                io_counters = process.io_counters()
                proc_res.io_read_bytes = io_counters.read_bytes
                proc_res.io_write_bytes = io_counters.write_bytes
            except:
                pass
            
            proc_res.status = process.status()
            
        except Exception as e:
            logger.debug(f"Failed to get process info: {e}")
        
        self.process_history.append(proc_res)
        return proc_res
    
    def _get_gpu_info(self) -> Tuple[int, List[int], List[float]]:
        try:
            import subprocess
            result = subprocess.run(
                ["nvidia-smi", 
                 "--query-gpu=index,memory.total,memory.used,utilization.gpu",
                 "--format=csv,nounits,noheader"],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                gpu_memory = []
                gpu_utilization = []
                for line in result.stdout.strip().split('\n'):
                    if line:
                        parts = line.split(',')
                        if len(parts) >= 3:
                            gpu_memory.append(int(parts[1].strip()))
                            util_str = parts[2].strip().replace('%', '')
                            gpu_utilization.append(float(util_str) if util_str else 0.0)
                return len(gpu_memory), gpu_memory, gpu_utilization
        except:
            pass
        
        return 0, [], []
    
    def get_average_usage(self, window_size: int = 10) -> Dict:
        if len(self.system_history) == 0:
            return {}
        
        window = list(self.system_history)[-window_size:]
        
        return {
            'avg_cpu': sum(r.cpu_usage for r in window) / len(window),
            'avg_memory_percent': sum(r.memory_percent for r in window) / len(window),
            'max_memory_mb': max(r.used_memory for r in window) / (1024 * 1024),
            'gpu_count': window[-1].gpu_count if window else 0
        }
    
    def print_system_summary(self) -> None:
        res = self.get_system_resources()
        
        print("=" * 60)
        print("System Resource Summary")
        print("=" * 60)
        print(f"  CPU: {res.cpu_count} cores, {res.cpu_usage:.1f}% used")
        print(f"  Memory: {res.used_memory/(1024**3):.2f}/{res.total_memory/(1024**3):.2f} GB "
              f"({res.memory_percent:.1f}%)")
        print(f"  Disk: {res.used_disk/(1024**3):.2f}/{res.total_disk/(1024**3):.2f} GB "
              f"({res.disk_percent:.1f}%)")
        if res.gpu_count > 0:
            print(f"  GPU: {res.gpu_count} devices")
            for i, (mem, util) in enumerate(zip(res.gpu_memory, res.gpu_utilization)):
                print(f"    GPU {i}: {util:.0f}% util, {mem} MB total")
        print("=" * 60)


class PerformanceProfiler:
    def __init__(self):
        self.timers: Dict[str, List[float]] = {}
        self.counters: Dict[str, int] = {}
    
    def start_timer(self, name: str) -> None:
        if name not in self.timers:
            self.timers[name] = []
        self.timers[name].append(time.perf_counter())
    
    def stop_timer(self, name: str) -> float:
        if name not in self.timers or len(self.timers[name]) == 0:
            return 0.0
        
        elapsed = time.perf_counter() - self.timers[name].pop()
        self.timers[name].append(elapsed)
        return elapsed
    
    def increment_counter(self, name: str, amount: int = 1) -> None:
        self.counters[name] = self.counters.get(name, 0) + amount
    
    def get_timer_stats(self, name: str) -> Dict:
        if name not in self.timers or len(self.timers[name]) == 0:
            return {}
        
        times = self.timers[name]
        return {
            'count': len(times),
            'total': sum(times),
            'mean': sum(times) / len(times),
            'min': min(times),
            'max': max(times)
        }
    
    def print_summary(self) -> None:
        print("=" * 60)
        print("Performance Profile")
        print("=" * 60)
        
        for name in sorted(self.timers.keys()):
            stats = self.get_timer_stats(name)
            if stats:
                print(f"  {name}:")
                print(f"    count={stats['count']}, total={stats['total']*1000:.2f}ms, "
                      f"mean={stats['mean']*1000:.3f}ms")
        
        if self.counters:
            print("\n  Counters:")
            for name, count in sorted(self.counters.items()):
                print(f"    {name}: {count}")
        
        print("=" * 60)
