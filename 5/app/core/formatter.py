import json
import re
import logging
from typing import Dict, Any, List, Optional
from app.schemas import SchemaField

logger = logging.getLogger(__name__)


class ResultFormatter:
    def __init__(self):
        self.type_validators = {
            "string": self._validate_string,
            "number": self._validate_number,
            "boolean": self._validate_boolean,
            "array": self._validate_array,
            "object": self._validate_object
        }

    def format(
        self,
        raw_result: Optional[Dict[str, Any]],
        schema: List[SchemaField]
    ) -> Dict[str, Any]:
        if raw_result is None:
            raw_result = {}

        formatted_result: Dict[str, Any] = {}
        schema_dict = {field.name: field for field in schema}

        for field_name, field_schema in schema_dict.items():
            if field_name in raw_result:
                value = raw_result.get(field_name)
            else:
                alt_value = self._find_field_by_alias(field_name, raw_result)
                value = alt_value

            formatted_result[field_name] = self._format_field(
                value,
                field_schema,
                parent_key=field_name
            )

        extra_fields = {}
        for key, value in raw_result.items():
            if key not in formatted_result:
                extra_fields[key] = value

        if extra_fields:
            formatted_result["_extra_fields"] = extra_fields

        return formatted_result

    def _find_field_by_alias(
        self,
        field_name: str,
        raw_result: Dict[str, Any]
    ) -> Optional[Any]:
        field_name_lower = field_name.lower()
        aliases = {
            "name": ["姓名", "名字", "名称", "full_name", "fullname"],
            "age": ["年龄", "岁数"],
            "phone": ["电话", "手机", "联系电话", "mobile", "telephone", "phone_number"],
            "email": ["邮箱", "电子邮件", "e-mail", "mail"],
            "id_card": ["身份证", "身份证号", "身份证号码", "idcard"],
            "address": ["地址", "住址", "居住地址", "家庭住址"],
            "gender": ["性别"],
            "company": ["公司", "企业", "工作单位"],
            "position": ["职位", "职务", "岗位"]
        }

        possible_names = aliases.get(field_name_lower, [])
        possible_names.append(field_name)

        for name in possible_names:
            for key, value in raw_result.items():
                if key.lower() == name.lower() or name.lower() in key.lower():
                    logger.info(f"通过别名匹配到字段: {field_name} <- {key}")
                    return value

        for key, value in raw_result.items():
            if field_name_lower in key.lower() or key.lower() in field_name_lower:
                if len(key) > 1 and len(field_name) > 1:
                    logger.info(f"通过模糊匹配找到字段: {field_name} <- {key}")
                    return value

        return None

    def _format_field(
        self,
        value: Any,
        field_schema: SchemaField,
        parent_key: str = ""
    ) -> Any:
        if value is None:
            if field_schema.required:
                default_val = self._get_default_for_type(field_schema.type)
                logger.warning(f"必填字段 {parent_key} 缺失，使用默认值: {default_val}")
                return default_val
            return None

        if value == "" or (isinstance(value, str) and value.strip() == ""):
            if field_schema.required:
                default_val = self._get_default_for_type(field_schema.type)
                logger.warning(f"必填字段 {parent_key} 值为空，使用默认值: {default_val}")
                return default_val
            return None if field_schema.type != "string" else ""

        validator = self.type_validators.get(field_schema.type)
        if validator:
            try:
                validated = validator(value)
                if validated is None and field_schema.required:
                    default_val = self._get_default_for_type(field_schema.type)
                    logger.warning(f"字段 {parent_key} 验证失败，使用默认值: {default_val}")
                    return default_val
                return validated
            except Exception as e:
                logger.warning(f"字段 {parent_key} 验证异常: {str(e)}")
                if field_schema.required:
                    default_val = self._get_default_for_type(field_schema.type)
                    logger.warning(f"必填字段 {parent_key} 验证失败，使用默认值: {default_val}")
                    return default_val
                return None

        return value

    def _validate_string(self, value: Any) -> str:
        if isinstance(value, str):
            return value.strip()
        if value is None:
            return ""
        return str(value).strip()

    def _validate_number(self, value: Any) -> Optional[float]:
        if isinstance(value, (int, float)):
            return value
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return None
            try:
                if "." in value:
                    return float(value)
                return int(value)
            except ValueError:
                match = re.search(r'-?\d+\.?\d*', value)
                if match:
                    num_str = match.group()
                    return float(num_str) if "." in num_str else int(num_str)
                return None
        return None

    def _validate_boolean(self, value: Any) -> Optional[bool]:
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return value != 0
        if isinstance(value, str):
            value_lower = value.lower().strip()
            if value_lower in ("true", "是", "有", "yes", "1", "on"):
                return True
            if value_lower in ("false", "否", "无", "no", "0", "off", ""):
                return False
            return None
        return None

    def _validate_array(self, value: Any) -> List[Any]:
        if isinstance(value, list):
            return [item for item in value if item is not None and item != ""]
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return []
            if value.startswith("[") and value.endswith("]"):
                try:
                    parsed = json.loads(value)
                    if isinstance(parsed, list):
                        return [item for item in parsed if item is not None and item != ""]
                except json.JSONDecodeError:
                    pass
            parts = [p.strip() for p in re.split(r'[，,、;；]', value) if p.strip()]
            return parts
        return []

    def _validate_object(self, value: Any) -> Optional[Dict[str, Any]]:
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            value = value.strip()
            if value.startswith("{") and value.endswith("}"):
                try:
                    parsed = json.loads(value)
                    if isinstance(parsed, dict):
                        return parsed
                except json.JSONDecodeError:
                    pass
        return None

    def _get_default_for_type(self, field_type: str) -> Any:
        defaults = {
            "string": "",
            "number": None,
            "boolean": None,
            "array": [],
            "object": {}
        }
        return defaults.get(field_type)

    def validate_result(
        self,
        result: Dict[str, Any],
        schema: List[SchemaField]
    ) -> Dict[str, Any]:
        errors: List[str] = []
        schema_dict = {field.name: field for field in schema}

        for field_name, field_schema in schema_dict.items():
            if field_name not in result:
                if field_schema.required:
                    errors.append(f"缺少必填字段: {field_name}")
                continue

            value = result[field_name]
            if value is None and field_schema.required:
                errors.append(f"必填字段值为null: {field_name}")

        if errors:
            return {"valid": False, "errors": errors}

        return {"valid": True, "errors": []}


formatter = ResultFormatter()
