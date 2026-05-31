import json
import xml.etree.ElementTree as ET
from typing import Dict, Any, List
import yaml
import csv
from io import StringIO


class ParameterParser:
    def __init__(self):
        self.supported_elements = {
            "lens": {
                "name": "透镜",
                "parameters": ["focal_length", "diameter", "refractive_index", "thickness"]
            },
            "mirror": {
                "name": "反射镜",
                "parameters": ["reflectivity", "diameter", "curvature_radius"]
            },
            "beam_splitter": {
                "name": "分光镜",
                "parameters": ["split_ratio", "reflectivity", "transmission"]
            },
            "aperture": {
                "name": "光阑",
                "parameters": ["radius", "shape"]
            },
            "grating": {
                "name": "光栅",
                "parameters": ["lines_per_mm", "order", "blaze_wavelength"]
            },
            "prism": {
                "name": "棱镜",
                "parameters": ["apex_angle", "refractive_index", "material"]
            },
            "filter": {
                "name": "滤光片",
                "parameters": ["center_wavelength", "bandwidth", "transmission"]
            },
            "waveplate": {
                "name": "波片",
                "parameters": ["type", "wavelength", "retardation"]
            },
            "detector": {
                "name": "探测器",
                "parameters": ["resolution", "sensitivity", "area"]
            },
            "light_source": {
                "name": "光源",
                "parameters": ["wavelength", "power", "beam_diameter", "divergence"]
            }
        }

    def parse(self, content: str, file_type: str) -> Dict[str, Any]:
        file_type = file_type.lower()
        
        if file_type == 'json':
            return self._parse_json(content)
        elif file_type == 'yaml' or file_type == 'yml':
            return self._parse_yaml(content)
        elif file_type == 'xml':
            return self._parse_xml(content)
        elif file_type == 'csv':
            return self._parse_csv(content)
        else:
            raise ValueError(f"不支持的文件类型: {file_type}")

    def _parse_json(self, content: str) -> Dict[str, Any]:
        data = json.loads(content)
        return self._normalize_data(data)

    def _parse_yaml(self, content: str) -> Dict[str, Any]:
        data = yaml.safe_load(content)
        return self._normalize_data(data)

    def _safe_float(self, value: str, default: float = 0.0) -> float:
        try:
            if value is None or str(value).strip() == "":
                return default
            return float(value)
        except (ValueError, TypeError):
            return default

    def _parse_xml(self, content: str) -> Dict[str, Any]:
        root = ET.fromstring(content)
        elements = []
        
        for elem in root.findall(".//element"):
            element_data = {
                "id": elem.get("id", ""),
                "type": elem.get("type", ""),
                "position": {
                    "x": self._safe_float(elem.findtext("position/x", "0"), 0.0),
                    "y": self._safe_float(elem.findtext("position/y", "0"), 0.0),
                    "z": self._safe_float(elem.findtext("position/z", "0"), 0.0)
                },
                "parameters": {}
            }
            
            params_elem = elem.find("parameters")
            if params_elem is not None:
                for param in params_elem:
                    element_data["parameters"][param.tag] = self._convert_value(param.text)
            
            elements.append(element_data)
        
        light_source = {}
        source_elem = root.find("light_source")
        if source_elem is not None:
            light_source = {
                "wavelength": self._safe_float(source_elem.findtext("wavelength", "632.8"), 632.8),
                "power": self._safe_float(source_elem.findtext("power", "1.0"), 1.0),
                "beam_diameter": self._safe_float(source_elem.findtext("beam_diameter", "5.0"), 5.0),
                "position": {
                    "x": self._safe_float(source_elem.findtext("position/x", "0"), 0.0),
                    "y": self._safe_float(source_elem.findtext("position/y", "0"), 0.0),
                    "z": self._safe_float(source_elem.findtext("position/z", "0"), 0.0)
                }
            }
        
        return {
            "elements": elements,
            "light_source": light_source,
            "metadata": {
                "name": root.findtext("metadata/name", "未命名光路"),
                "description": root.findtext("metadata/description", "")
            }
        }

    def _parse_csv(self, content: str) -> Dict[str, Any]:
        reader = csv.DictReader(StringIO(content))
        elements = []
        
        for row in reader:
            element_data = {
                "id": row.get("id", ""),
                "type": row.get("type", ""),
                "position": {
                    "x": self._safe_float(row.get("position_x", "0"), 0.0),
                    "y": self._safe_float(row.get("position_y", "0"), 0.0),
                    "z": self._safe_float(row.get("position_z", "0"), 0.0)
                },
                "parameters": {}
            }
            
            for key, value in row.items():
                if key.startswith("param_"):
                    param_name = key[6:]
                    element_data["parameters"][param_name] = self._convert_value(value)
            
            elements.append(element_data)
        
        return {
            "elements": elements,
            "light_source": {
                "wavelength": 632.8,
                "power": 1.0,
                "beam_diameter": 5.0,
                "position": {"x": 0, "y": 0, "z": 0}
            },
            "metadata": {"name": "CSV导入光路"}
        }

    def _convert_value(self, value: Any) -> Any:
        if value is None:
            return ""
        try:
            str_value = str(value).strip()
            if str_value == "":
                return ""
            return int(str_value)
        except ValueError:
            try:
                return float(str_value)
            except ValueError:
                return str_value

    def _validate_element(self, element: Dict[str, Any]) -> Dict[str, Any]:
        params = element.get("parameters", {})
        elem_type = element.get("type", "")
        
        validated_params = {}
        for key, value in params.items():
            if isinstance(value, (int, float)):
                if key in ["reflectivity", "transmission", "split_ratio"]:
                    validated_params[key] = max(0.0, min(1.0, float(value)))
                elif key == "focal_length" and abs(float(value)) < 0.1:
                    validated_params[key] = 100.0
                elif key == "radius" and float(value) <= 0:
                    validated_params[key] = 5.0
                elif key == "diameter" and float(value) <= 0:
                    validated_params[key] = 25.4
                else:
                    validated_params[key] = value
            else:
                validated_params[key] = value
        
        element["parameters"] = validated_params
        return element

    def _normalize_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        elements = data.get("elements", [])
        normalized_elements = []
        
        for elem in elements:
            normalized_elem = {
                "id": elem.get("id", ""),
                "type": elem.get("type", ""),
                "position": elem.get("position", {"x": 0, "y": 0, "z": 0}),
                "parameters": elem.get("parameters", {})
            }
            normalized_elem = self._validate_element(normalized_elem)
            normalized_elements.append(normalized_elem)
        
        light_source = data.get("light_source", {})
        normalized_light_source = {
            "wavelength": max(10.0, min(10000.0, float(light_source.get("wavelength", 632.8)))),
            "power": max(0.0, float(light_source.get("power", 1.0))),
            "beam_diameter": max(0.1, float(light_source.get("beam_diameter", 5.0))),
            "position": light_source.get("position", {"x": 0, "y": 0, "z": 0})
        }
        
        return {
            "elements": normalized_elements,
            "light_source": normalized_light_source,
            "metadata": data.get("metadata", {"name": "未命名光路"})
        }

    def get_supported_elements(self) -> List[Dict[str, Any]]:
        return [
            {"type": type_key, "name": elem_info["name"], "parameters": elem_info["parameters"]}
            for type_key, elem_info in self.supported_elements.items()
        ]

    def get_template(self, template_name: str) -> Dict[str, Any]:
        templates = {
            "michelson": {
                "name": "迈克尔逊干涉仪",
                "elements": [
                    {
                        "id": "bs1",
                        "type": "beam_splitter",
                        "position": {"x": 100, "y": 0, "z": 0},
                        "parameters": {"split_ratio": 0.5, "reflectivity": 0.5, "transmission": 0.5}
                    },
                    {
                        "id": "m1",
                        "type": "mirror",
                        "position": {"x": 200, "y": 0, "z": 0},
                        "parameters": {"reflectivity": 0.95, "diameter": 25.4}
                    },
                    {
                        "id": "m2",
                        "type": "mirror",
                        "position": {"x": 100, "y": 100, "z": 0},
                        "parameters": {"reflectivity": 0.95, "diameter": 25.4}
                    },
                    {
                        "id": "detector",
                        "type": "detector",
                        "position": {"x": 100, "y": -50, "z": 0},
                        "parameters": {"resolution": 1024, "sensitivity": 1.0}
                    }
                ],
                "light_source": {
                    "wavelength": 632.8,
                    "power": 1.0,
                    "beam_diameter": 5.0,
                    "position": {"x": 0, "y": 0, "z": 0}
                }
            },
            "mach_zehnder": {
                "name": "马赫-曾德尔干涉仪",
                "elements": [
                    {
                        "id": "bs1",
                        "type": "beam_splitter",
                        "position": {"x": 100, "y": 0, "z": 0},
                        "parameters": {"split_ratio": 0.5}
                    },
                    {
                        "id": "m1",
                        "type": "mirror",
                        "position": {"x": 200, "y": 0, "z": 0},
                        "parameters": {"reflectivity": 0.95}
                    },
                    {
                        "id": "m2",
                        "type": "mirror",
                        "position": {"x": 100, "y": 100, "z": 0},
                        "parameters": {"reflectivity": 0.95}
                    },
                    {
                        "id": "bs2",
                        "type": "beam_splitter",
                        "position": {"x": 200, "y": 100, "z": 0},
                        "parameters": {"split_ratio": 0.5}
                    },
                    {
                        "id": "detector",
                        "type": "detector",
                        "position": {"x": 300, "y": 100, "z": 0},
                        "parameters": {"resolution": 1024}
                    }
                ],
                "light_source": {
                    "wavelength": 632.8,
                    "power": 1.0,
                    "beam_diameter": 5.0,
                    "position": {"x": 0, "y": 0, "z": 0}
                }
            }
        }
        
        if template_name not in templates:
            raise ValueError(f"模板不存在: {template_name}")
        
        return templates[template_name]

    def export_to_json(self, data: Dict[str, Any]) -> str:
        return json.dumps(data, ensure_ascii=False, indent=2)

    def export_to_yaml(self, data: Dict[str, Any]) -> str:
        return yaml.dump(data, allow_unicode=True, default_flow_style=False)
