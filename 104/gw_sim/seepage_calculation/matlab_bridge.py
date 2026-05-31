import numpy as np
import os
import json
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class MatlabEngineBridge:

    def __init__(self, scripts_dir: Optional[str] = None):
        self.engine = None
        self.scripts_dir = scripts_dir or os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "matlab_scripts"
        )
        self._connected = False

    def connect(self) -> bool:
        try:
            import matlab.engine
            self.engine = matlab.engine.start_matlab()
            self._connected = True
            logger.info("MATLAB engine connected successfully")
            return True
        except Exception as e:
            logger.warning(f"MATLAB engine connection failed: {e}, falling back to Python solver")
            self._connected = False
            return False

    def disconnect(self):
        if self.engine is not None:
            try:
                self.engine.quit()
            except Exception:
                pass
            self._connected = False
            self.engine = None

    @property
    def is_connected(self) -> bool:
        return self._connected and self.engine is not None

    def run_seepage_steady(
        self,
        k_field: np.ndarray,
        boundary_top: np.ndarray,
        boundary_bottom: np.ndarray,
        recharge: float = 0.0,
    ) -> Optional[np.ndarray]:
        if not self.is_connected:
            logger.warning("MATLAB engine not connected")
            return None

        try:
            k_ml = matlab.double(k_field.tolist())
            bt_ml = matlab.double(boundary_top.tolist())
            bb_ml = matlab.double(boundary_bottom.tolist())

            self.engine.cd(self.scripts_dir, nargout=0)
            h_result = self.engine.gw_seepage_steady(k_ml, bt_ml, bb_ml, recharge, nargout=1)

            return np.array(h_result)
        except Exception as e:
            logger.error(f"MATLAB seepage steady calculation failed: {e}")
            return None

    def run_seepage_transient(
        self,
        k_field: np.ndarray,
        s_field: np.ndarray,
        h_initial: np.ndarray,
        boundary_top: np.ndarray,
        boundary_bottom: np.ndarray,
        n_steps: int = 100,
        recharge: float = 0.0,
    ) -> Optional[Dict]:
        if not self.is_connected:
            return None

        try:
            k_ml = matlab.double(k_field.tolist())
            s_ml = matlab.double(s_field.tolist())
            h0_ml = matlab.double(h_initial.tolist())
            bt_ml = matlab.double(boundary_top.tolist())
            bb_ml = matlab.double(boundary_bottom.tolist())

            self.engine.cd(self.scripts_dir, nargout=0)
            h_final, h_series = self.engine.gw_seepage_transient(
                k_ml, s_ml, h0_ml, bt_ml, bb_ml, float(n_steps), recharge, nargout=2
            )

            return {
                "h_final": np.array(h_final),
                "h_series": [np.array(h) for h in h_series],
            }
        except Exception as e:
            logger.error(f"MATLAB transient calculation failed: {e}")
            return None

    def run_water_level_evolution(
        self,
        h_initial: np.ndarray,
        params: Dict,
    ) -> Optional[Dict]:
        if not self.is_connected:
            return None

        try:
            h0_ml = matlab.double(h_initial.tolist())
            params_json = json.dumps(params)

            self.engine.cd(self.scripts_dir, nargout=0)
            result = self.engine.gw_water_level_evolution(h0_ml, params_json, nargout=1)

            return {"h_result": np.array(result)}
        except Exception as e:
            logger.error(f"MATLAB water level evolution failed: {e}")
            return None
