import numpy as np
import time
import logging
from typing import Dict, List, Optional, Tuple, Callable
from .checkpoint import CheckpointManager

logger = logging.getLogger(__name__)


class WaterLevelEvolution:

    def __init__(self, dt: float = 1.0, total_days: int = 365):
        self.dt = dt
        self.total_days = total_days
        self.n_steps = int(total_days / dt)
        self._cancel_flag = False
        self._progress_callback: Optional[Callable[[int, int], None]] = None
        self._timeout_seconds: Optional[float] = None
        self._start_time: Optional[float] = None
        self._checkpoint_manager: Optional[CheckpointManager] = None
        self._checkpoint_task_id: Optional[str] = None
        self._checkpoint_interval: int = 100

    def set_progress_callback(self, callback: Optional[Callable[[int, int], None]]):
        self._progress_callback = callback

    def set_cancel_flag(self, flag: bool = True):
        self._cancel_flag = flag

    def set_timeout(self, seconds: Optional[float]):
        self._timeout_seconds = seconds

    def enable_checkpoint(
        self,
        task_id: str,
        checkpoint_dir: Optional[str] = None,
        checkpoint_interval: int = 100,
    ):
        self._checkpoint_manager = CheckpointManager(checkpoint_dir)
        self._checkpoint_task_id = task_id
        self._checkpoint_interval = checkpoint_interval

    def _save_checkpoint(self, step: int, state: Dict, metadata: Optional[Dict] = None):
        if self._checkpoint_manager and self._checkpoint_task_id:
            try:
                self._checkpoint_manager.save(
                    self._checkpoint_task_id, step, state, metadata
                )
                self._checkpoint_manager.cleanup(self._checkpoint_task_id, keep_last=3)
            except Exception as e:
                logger.warning(f"Checkpoint save failed at step {step}: {e}")

    def _load_checkpoint(self) -> Optional[Dict]:
        if self._checkpoint_manager and self._checkpoint_task_id:
            try:
                return self._checkpoint_manager.load(self._checkpoint_task_id)
            except Exception as e:
                logger.warning(f"Checkpoint load failed: {e}")
        return None

    def _check_timeout(self) -> bool:
        if self._timeout_seconds is None or self._start_time is None:
            return False
        return (time.time() - self._start_time) > self._timeout_seconds

    def _update_progress(self, current: int, total: int):
        if self._progress_callback:
            try:
                self._progress_callback(current, total)
            except Exception as e:
                logger.warning(f"Progress callback failed: {e}")

    def simulate_seasonal(
        self,
        h_base: np.ndarray,
        amplitude: float = 2.0,
        phase: float = 0.0,
        period: float = 365.0,
        recharge_seasonal: Optional[np.ndarray] = None,
        checkpoint_interval: int = 50,
        resume: bool = False,
    ) -> List[np.ndarray]:
        self._start_time = time.time()
        self._cancel_flag = False
        results = []
        start_step = 0

        if resume:
            cp = self._load_checkpoint()
            if cp is not None:
                start_step = cp["step"] + 1
                results = cp["state"].get("results", [])
                h_base = cp["state"].get("h_base", h_base)
                logger.info(f"Resuming seasonal simulation from step {start_step}")

        for step in range(start_step, self.n_steps):
            if self._cancel_flag:
                logger.info(f"Simulation cancelled at step {step}")
                self._save_checkpoint(step, {"h_base": h_base, "results": results[-1] if results else h_base})
                break
            if self._check_timeout():
                logger.warning(f"Simulation timeout at step {step}")
                self._save_checkpoint(step, {"h_base": h_base, "results": results[-1] if results else h_base})
                raise TimeoutError(f"Simulation exceeded {self._timeout_seconds}s timeout")

            t = step * self.dt
            seasonal_factor = amplitude * np.sin(2 * np.pi * t / period + phase)
            h_t = h_base + seasonal_factor
            if recharge_seasonal is not None:
                idx = min(step, len(recharge_seasonal) - 1)
                h_t = h_t + recharge_seasonal[idx]
            results.append(h_t.copy())

            if step % checkpoint_interval == 0:
                self._update_progress(step, self.n_steps)
            if self._checkpoint_interval and step % self._checkpoint_interval == 0:
                self._save_checkpoint(step, {"h_base": h_base, "results_last": results[-1]})

        self._update_progress(self.n_steps, self.n_steps)
        return results

    def simulate_decline(
        self,
        h_initial: np.ndarray,
        decline_rate: float = 0.005,
        k_field: Optional[np.ndarray] = None,
        checkpoint_interval: int = 50,
        resume: bool = False,
    ) -> List[np.ndarray]:
        self._start_time = time.time()
        self._cancel_flag = False
        results = []
        h = h_initial.copy()
        start_step = 0

        if resume:
            cp = self._load_checkpoint()
            if cp is not None:
                start_step = cp["step"] + 1
                h = cp["state"].get("h_current", h)
                results = cp["state"].get("results", [])
                logger.info(f"Resuming decline simulation from step {start_step}")

        for step in range(start_step, self.n_steps):
            if self._cancel_flag:
                logger.info(f"Simulation cancelled at step {step}")
                self._save_checkpoint(step, {"h_current": h})
                break
            if self._check_timeout():
                logger.warning(f"Simulation timeout at step {step}")
                self._save_checkpoint(step, {"h_current": h})
                raise TimeoutError(f"Simulation exceeded {self._timeout_seconds}s timeout")

            decline = decline_rate * self.dt
            if k_field is not None:
                decline_map = decline * (k_field / k_field.max())
                h = h - decline_map
            else:
                h = h - decline
            results.append(h.copy())

            if step % checkpoint_interval == 0:
                self._update_progress(step, self.n_steps)
            if self._checkpoint_interval and step % self._checkpoint_interval == 0:
                self._save_checkpoint(step, {"h_current": h})

        self._update_progress(self.n_steps, self.n_steps)
        return results

    def simulate_pumping(
        self,
        h_initial: np.ndarray,
        well_positions: List[Tuple[int, int]],
        pumping_rates: List[float],
        radius_of_influence: float = 200.0,
        dx: float = 10.0,
        dy: float = 10.0,
        checkpoint_interval: int = 10,
        resume: bool = False,
    ) -> List[np.ndarray]:
        self._start_time = time.time()
        self._cancel_flag = False
        results = []
        h = h_initial.copy()
        start_step = 0
        ny, nx = h.shape

        y_grid, x_grid = np.mgrid[0:ny, 0:nx]
        drawdown_coeffs = []
        for (wj, wi), q in zip(well_positions, pumping_rates):
            dist = np.sqrt(((x_grid - wi) * dx)**2 + ((y_grid - wj) * dy)**2)
            mask = dist < radius_of_influence
            safe_dist = np.maximum(dist, 1.0)
            coeff = q / (2 * np.pi * radius_of_influence) * np.log(radius_of_influence / safe_dist) * self.dt
            coeff[~mask] = 0
            drawdown_coeffs.append(coeff)

        if resume:
            cp = self._load_checkpoint()
            if cp is not None:
                start_step = cp["step"] + 1
                h = cp["state"].get("h_current", h)
                logger.info(f"Resuming pumping simulation from step {start_step}")

        for step in range(start_step, self.n_steps):
            if self._cancel_flag:
                logger.info(f"Simulation cancelled at step {step}")
                self._save_checkpoint(step, {"h_current": h})
                break
            if self._check_timeout():
                logger.warning(f"Simulation timeout at step {step}")
                self._save_checkpoint(step, {"h_current": h})
                raise TimeoutError(f"Simulation exceeded {self._timeout_seconds}s timeout")

            for coeff in drawdown_coeffs:
                h = h - coeff
            results.append(h.copy())

            if step % checkpoint_interval == 0:
                self._update_progress(step, self.n_steps)
            if self._checkpoint_interval and step % self._checkpoint_interval == 0:
                self._save_checkpoint(step, {"h_current": h})

        self._update_progress(self.n_steps, self.n_steps)
        return results

    def long_term_projection(
        self,
        h_initial: np.ndarray,
        years: int = 10,
        annual_decline_rate: float = 0.5,
        seasonal_amplitude: float = 2.0,
        checkpoint_interval: int = 1,
        sample_rate: int = 30,
        resume: bool = False,
    ) -> Dict[str, np.ndarray]:
        self._start_time = time.time()
        self._cancel_flag = False
        h_annual = [h_initial.copy()]
        h_samples = []
        start_year = 0

        if resume:
            cp = self._load_checkpoint()
            if cp is not None:
                start_year = cp["step"] + 1
                h_annual = cp["state"].get("h_annual", [h_initial.copy()])
                h_samples = cp["state"].get("h_samples", [])
                logger.info(f"Resuming long term projection from year {start_year}")

        for year in range(start_year, years):
            if self._cancel_flag:
                logger.info(f"Long term projection cancelled at year {year}")
                self._save_checkpoint(year, {
                    "h_annual": h_annual,
                    "h_samples": h_samples[-1] if h_samples else h_initial,
                })
                break
            if self._check_timeout():
                logger.warning(f"Long term projection timeout at year {year}")
                self._save_checkpoint(year, {
                    "h_annual": h_annual,
                    "h_samples": h_samples[-1] if h_samples else h_initial,
                })
                raise TimeoutError(f"Projection exceeded {self._timeout_seconds}s timeout")

            cumulative_decline = annual_decline_rate * (year + 1)
            days = np.arange(365)
            seasonal = seasonal_amplitude * np.sin(2 * np.pi * days / 365.0)
            h_daily = h_initial - cumulative_decline + seasonal[:, np.newaxis, np.newaxis]

            for idx in range(0, 365, sample_rate):
                h_samples.append(h_daily[idx])

            h_annual.append(h_daily[-1].copy())

            if year % checkpoint_interval == 0:
                self._update_progress(year, years)
            if self._checkpoint_interval and year % max(1, self._checkpoint_interval // 365) == 0:
                self._save_checkpoint(year, {
                    "h_annual_last": h_annual[-1],
                    "h_samples_last": h_samples[-1] if h_samples else h_initial,
                })

        self._update_progress(years, years)
        return {
            "h_initial": h_initial,
            "h_final": h_annual[-1],
            "h_annual": h_annual,
            "h_samples": h_samples,
            "total_decline": h_initial - h_annual[-1],
        }
