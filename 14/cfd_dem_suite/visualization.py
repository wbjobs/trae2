import sys
import time
import threading
from typing import Optional, Dict, List, Callable
from dataclasses import dataclass, field
from collections import deque
import logging

logger = logging.getLogger(__name__)


@dataclass
class ProgressStats:
    progress: float = 0.0
    current_step: int = 0
    total_steps: int = 0
    elapsed_time: float = 0.0
    eta: float = 0.0
    steps_per_second: float = 0.0
    collision_count: int = 0
    energy_kinetic: float = 0.0
    energy_potential: float = 0.0
    memory_mb: float = 0.0
    cpu_percent: float = 0.0


@dataclass
class RealtimeVisualizerConfig:
    enabled: bool = True
    update_interval: float = 0.5
    bar_length: int = 50
    show_stats: bool = True
    show_energy: bool = True
    show_speed: bool = True
    show_eta: bool = True
    color_output: bool = True
    clear_screen: bool = False


class RealtimeProgressVisualizer:
    def __init__(self, config: Optional[RealtimeVisualizerConfig] = None):
        self.config = config or RealtimeVisualizerConfig()
        self.stats = ProgressStats()
        self._start_time: Optional[float] = None
        self._step_history: deque = deque(maxlen=100)
        self._lock = threading.Lock()
        self._last_update = 0.0
        self._is_active = False
        
        self._ansi_colors = {
            'reset': '\033[0m',
            'green': '\033[92m',
            'blue': '\033[94m',
            'cyan': '\033[96m',
            'yellow': '\033[93m',
            'red': '\033[91m',
            'bold': '\033[1m',
        }
    
    def _color(self, color_name: str) -> str:
        return self._ansi_colors.get(color_name, '') if self.config.color_output else ''
    
    def start(self, total_steps: int) -> None:
        self._start_time = time.time()
        self.stats.total_steps = total_steps
        self.stats.current_step = 0
        self.stats.progress = 0.0
        self._step_history.clear()
        self._is_active = True
        self._render()
    
    def update(
        self,
        current_step: int,
        collision_count: int = 0,
        energy_kinetic: float = 0.0,
        energy_potential: float = 0.0,
        memory_mb: float = 0.0,
        cpu_percent: float = 0.0
    ) -> None:
        if not self.config.enabled or not self._is_active:
            return
        
        now = time.time()
        if now - self._last_update < self.config.update_interval:
            return
        
        with self._lock:
            self._last_update = now
            self.stats.current_step = current_step
            self.stats.collision_count = collision_count
            self.stats.energy_kinetic = energy_kinetic
            self.stats.energy_potential = energy_potential
            self.stats.memory_mb = memory_mb
            self.stats.cpu_percent = cpu_percent
            
            if self.stats.total_steps > 0:
                self.stats.progress = min(current_step / self.stats.total_steps, 1.0)
            
            if self._start_time:
                self.stats.elapsed_time = now - self._start_time
                
                if current_step > 0:
                    self.stats.steps_per_second = current_step / self.stats.elapsed_time
                    
                    remaining = self.stats.total_steps - current_step
                    if self.stats.steps_per_second > 0:
                        self.stats.eta = remaining / self.stats.steps_per_second
            
            self._render()
    
    def _render(self) -> None:
        if self.config.clear_screen:
            sys.stdout.write('\033[2J\033[H')
        else:
            sys.stdout.write('\r')
        
        lines = self._build_output()
        
        if not self.config.clear_screen:
            sys.stdout.write('\033[K')
            sys.stdout.write(lines[0])
            if len(lines) > 1 and self.config.show_stats:
                sys.stdout.write('\n')
                sys.stdout.write('\n'.join(lines[1:]))
        else:
            sys.stdout.write('\n'.join(lines))
        
        sys.stdout.flush()
    
    def _build_output(self) -> List[str]:
        lines = []
        
        bar = self._build_progress_bar()
        lines.append(bar)
        
        if self.config.show_stats:
            stats_line = self._build_stats_line()
            lines.append(stats_line)
        
        if self.config.show_energy:
            energy_line = self._build_energy_line()
            lines.append(energy_line)
        
        if self.config.show_speed:
            speed_line = self._build_speed_line()
            lines.append(speed_line)
        
        return lines
    
    def _build_progress_bar(self) -> str:
        filled = int(self.config.bar_length * self.stats.progress)
        bar = '█' * filled + '░' * (self.config.bar_length - filled)
        percent = self.stats.progress * 100
        
        parts = []
        parts.append(f"{self._color('bold')}{self._color('cyan')}CFD-DEM{self._color('reset')}")
        parts.append(f"[{self._color('green')}{bar}{self._color('reset')}]")
        parts.append(f"{self._color('bold')}{percent:5.1f}%{self._color('reset')}")
        parts.append(f"Step {self.stats.current_step}/{self.stats.total_steps}")
        
        return ' '.join(parts)
    
    def _build_stats_line(self) -> str:
        parts = []
        
        parts.append(f"  Collisions: {self.stats.collision_count:,}")
        
        if self.stats.memory_mb > 0:
            parts.append(f"Memory: {self.stats.memory_mb:.1f}MB")
        
        if self.stats.cpu_percent > 0:
            parts.append(f"CPU: {self.stats.cpu_percent:.1f}%")
        
        return '  '.join(parts)
    
    def _build_energy_line(self) -> str:
        total_energy = self.stats.energy_kinetic + self.stats.energy_potential
        
        parts = [
            f"  E_k: {self.stats.energy_kinetic:.6e} J",
            f"E_p: {self.stats.energy_potential:.6e} J",
            f"E_total: {total_energy:.6e} J"
        ]
        
        return '  '.join(parts)
    
    def _build_speed_line(self) -> str:
        parts = []
        
        parts.append(f"  Speed: {self.stats.steps_per_second:.1f} steps/s")
        
        if self.config.show_eta and self.stats.eta > 0:
            eta_str = self._format_time(self.stats.eta)
            elapsed_str = self._format_time(self.stats.elapsed_time)
            parts.append(f"Elapsed: {elapsed_str}")
            parts.append(f"ETA: {eta_str}")
        
        return '  '.join(parts)
    
    def _format_time(self, seconds: float) -> str:
        if seconds < 60:
            return f"{seconds:.1f}s"
        elif seconds < 3600:
            minutes = seconds // 60
            secs = seconds % 60
            return f"{int(minutes)}m{secs:.0f}s"
        else:
            hours = seconds // 3600
            minutes = (seconds % 3600) // 60
            return f"{int(hours)}h{int(minutes)}m"
    
    def complete(self) -> None:
        self.stats.progress = 1.0
        if self._start_time:
            self.stats.elapsed_time = time.time() - self._start_time
        
        self._render()
        self._is_active = False
        
        print()
        logger.info(f"Simulation completed in {self.stats.elapsed_time:.2f}s")
    
    def error(self, message: str) -> None:
        self._is_active = False
        print()
        logger.error(f"Simulation error: {message}")
    
    def get_progress_callback(self) -> Callable:
        def callback(state):
            self.update(
                current_step=state.current_step,
                collision_count=state.collision_count,
                energy_kinetic=state.energy_kinetic,
                energy_potential=state.energy_potential
            )
        return callback


class ASCIIProgressVisualizer:
    def __init__(self, bar_length: int = 40):
        self.bar_length = bar_length
        self._start_time = None
    
    def start(self, total: int, description: str = "Processing"):
        self._start_time = time.time()
        self.total = total
        self.description = description
        self._update(0)
    
    def _update(self, current: int, suffix: str = ""):
        if self._start_time is None:
            return
        
        percent = current / self.total
        filled = int(self.bar_length * percent)
        bar = '=' * filled + '-' * (self.bar_length - filled)
        
        elapsed = time.time() - self._start_time
        speed = current / elapsed if elapsed > 0 else 0
        
        eta = (self.total - current) / speed if speed > 0 else 0
        
        sys.stdout.write(
            f'\r{self.description}: [{bar}] {percent*100:5.1f}% '
            f'({current}/{self.total}) {speed:.1f}/s ETA: {eta:.1f}s {suffix}'
        )
        sys.stdout.flush()
    
    def update(self, current: int, suffix: str = ""):
        self._update(current, suffix)
    
    def finish(self, message: str = "Done"):
        self._update(self.total)
        print(f"\n{message} in {time.time() - self._start_time:.2f}s")


def create_visualizer(
    mode: str = "realtime",
    **kwargs
) -> Optional[object]:
    if mode == "realtime":
        config = RealtimeVisualizerConfig(**kwargs)
        return RealtimeProgressVisualizer(config)
    elif mode == "ascii":
        return ASCIIProgressVisualizer(**kwargs)
    elif mode == "none":
        return None
    else:
        logger.warning(f"Unknown visualizer mode: {mode}")
        return None
