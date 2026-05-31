import numpy as np
import logging
from typing import Dict, List, Optional, Tuple
from .solver import SeepageSolver
from .evolution import WaterLevelEvolution
from .matlab_bridge import MatlabEngineBridge

logger = logging.getLogger(__name__)


class ComputationEngine:

    def __init__(
        self,
        use_matlab: bool = True,
        nx: int = 50,
        ny: int = 50,
        dx: float = 10.0,
        dy: float = 10.0,
        dt: float = 1.0,
    ):
        self.solver = SeepageSolver(nx=nx, ny=ny, dx=dx, dy=dy, dt=dt)
        self.evolution = WaterLevelEvolution(dt=dt)
        self.matlab_bridge = MatlabEngineBridge()
        self._use_matlab = use_matlab

        if use_matlab:
            connected = self.matlab_bridge.connect()
            if not connected:
                logger.info("MATLAB unavailable, using Python native solver")
                self._use_matlab = False

    def compute_seepage_steady(self, params: Dict) -> Dict:
        k_field = np.array(params["k_field"])
        boundary_top = np.array(params["boundary_top"])
        boundary_bottom = np.array(params["boundary_bottom"])
        recharge = params.get("recharge", 0.0)

        if self._use_matlab:
            result = self.matlab_bridge.run_seepage_steady(
                k_field, boundary_top, boundary_bottom, recharge
            )
            if result is not None:
                vx, vy = self.solver.compute_velocity(result, k_field)
                return {"h": result, "vx": vx, "vy": vy, "backend": "matlab"}

        h = self.solver.steady_state(k_field, boundary_top, boundary_bottom, recharge=recharge)
        vx, vy = self.solver.compute_velocity(h, k_field)
        return {"h": h, "vx": vx, "vy": vy, "backend": "python"}

    def compute_seepage_transient(self, params: Dict) -> Dict:
        k_field = np.array(params["k_field"])
        s_field = np.array(params["s_field"])
        h_initial = np.array(params["h_initial"])
        boundary_top = np.array(params["boundary_top"])
        boundary_bottom = np.array(params["boundary_bottom"])
        n_steps = params.get("n_steps", 100)
        recharge = params.get("recharge", 0.0)

        if self._use_matlab:
            result = self.matlab_bridge.run_seepage_transient(
                k_field, s_field, h_initial, boundary_top, boundary_bottom, n_steps, recharge
            )
            if result is not None:
                return {
                    "h_final": result["h_final"],
                    "h_series": result["h_series"],
                    "backend": "matlab",
                }

        h_final, h_series = self.solver.transient(
            k_field, s_field, h_initial, boundary_top, boundary_bottom, n_steps, recharge
        )
        return {"h_final": h_final, "h_series": h_series, "backend": "python"}

    def compute_water_level_evolution(self, params: Dict) -> Dict:
        h_initial = np.array(params["h_initial"])
        mode = params.get("mode", "seasonal")
        timeout = params.get("timeout_seconds")
        if timeout is not None:
            self.evolution.set_timeout(float(timeout))

        if mode == "seasonal":
            results = self.evolution.simulate_seasonal(
                h_initial,
                amplitude=params.get("amplitude", 2.0),
                phase=params.get("phase", 0.0),
                period=params.get("period", 365.0),
                checkpoint_interval=params.get("checkpoint_interval", 50),
            )
        elif mode == "decline":
            results = self.evolution.simulate_decline(
                h_initial,
                decline_rate=params.get("decline_rate", 0.005),
                k_field=np.array(params["k_field"]) if "k_field" in params else None,
                checkpoint_interval=params.get("checkpoint_interval", 50),
            )
        elif mode == "pumping":
            results = self.evolution.simulate_pumping(
                h_initial,
                well_positions=params.get("well_positions", []),
                pumping_rates=params.get("pumping_rates", []),
                checkpoint_interval=params.get("checkpoint_interval", 10),
            )
        elif mode == "long_term":
            return self.evolution.long_term_projection(
                h_initial,
                years=params.get("years", 10),
                annual_decline_rate=params.get("annual_decline_rate", 0.5),
                seasonal_amplitude=params.get("seasonal_amplitude", 2.0),
                checkpoint_interval=params.get("checkpoint_interval", 1),
                sample_rate=params.get("sample_rate", 30),
            )
        else:
            raise ValueError(f"Unknown evolution mode: {mode}")

        return {"h_series": results, "mode": mode, "backend": "python"}

    def shutdown(self):
        if self.matlab_bridge.is_connected:
            self.matlab_bridge.disconnect()
