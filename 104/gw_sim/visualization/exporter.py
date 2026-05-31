import pandas as pd
import numpy as np
import json
import os
from typing import Dict, List, Optional
from datetime import datetime


class DataExporter:

    @staticmethod
    def to_csv(data: Dict, filepath: str, include_metadata: bool = True):
        if "h" in data:
            h = np.array(data["h"])
            df = pd.DataFrame(h)
            df.to_csv(filepath, index=False)
        elif "h_series" in data:
            all_frames = []
            for idx, h in enumerate(data["h_series"]):
                h_arr = np.array(h).flatten()
                frame_df = pd.DataFrame({"step": idx, "head": h_arr})
                all_frames.append(frame_df)
            pd.concat(all_frames, ignore_index=True).to_csv(filepath, index=False)
        else:
            pd.DataFrame(data).to_csv(filepath, index=False)

    @staticmethod
    def to_excel(data: Dict, filepath: str, sheet_name: str = "Results"):
        with pd.ExcelWriter(filepath, engine="openpyxl") as writer:
            if "h" in data:
                h = np.array(data["h"])
                pd.DataFrame(h).to_excel(writer, sheet_name=sheet_name, index=False)
            if "vx" in data:
                vx = np.array(data["vx"])
                pd.DataFrame(vx).to_excel(writer, sheet_name="Velocity_X", index=False)
            if "vy" in data:
                vy = np.array(data["vy"])
                pd.DataFrame(vy).to_excel(writer, sheet_name="Velocity_Y", index=False)
            if "h_series" in data:
                summary_rows = []
                for idx, h in enumerate(data["h_series"]):
                    h_arr = np.array(h)
                    summary_rows.append({
                        "step": idx,
                        "mean_head": float(h_arr.mean()),
                        "min_head": float(h_arr.min()),
                        "max_head": float(h_arr.max()),
                    })
                pd.DataFrame(summary_rows).to_excel(writer, sheet_name="Evolution_Summary", index=False)

    @staticmethod
    def to_json(data: Dict, filepath: str):
        def convert(obj):
            if isinstance(obj, np.ndarray):
                return obj.tolist()
            if isinstance(obj, (np.integer,)):
                return int(obj)
            if isinstance(obj, (np.floating,)):
                return float(obj)
            if isinstance(obj, datetime):
                return obj.isoformat()
            return obj

        serializable = json.loads(json.dumps(data, default=convert))
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(serializable, f, indent=2, ensure_ascii=False)

    @staticmethod
    def export_simulation_report(
        data: Dict,
        output_dir: str,
        task_id: str,
        format: str = "all",
    ) -> Dict[str, str]:
        os.makedirs(output_dir, exist_ok=True)
        exported = {}

        if format in ("csv", "all"):
            path = os.path.join(output_dir, f"{task_id}_result.csv")
            DataExporter.to_csv(data, path)
            exported["csv"] = path

        if format in ("excel", "all"):
            path = os.path.join(output_dir, f"{task_id}_result.xlsx")
            DataExporter.to_excel(data, path)
            exported["excel"] = path

        if format in ("json", "all"):
            path = os.path.join(output_dir, f"{task_id}_result.json")
            DataExporter.to_json(data, path)
            exported["json"] = path

        return exported
