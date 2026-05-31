import json
import httpx
import asyncio
import logging
from typing import List, Dict, Any, Optional, Tuple
from app.config import settings
from app.schemas import SchemaField
from app.core.preprocessor import preprocessor
from app.core.formatter import formatter

logger = logging.getLogger(__name__)


class LLMClient:
    def __init__(self):
        self.api_base = settings.LLM_API_BASE
        self.api_key = settings.LLM_API_KEY
        self.model = settings.LLM_MODEL
        self.timeout = settings.LLM_TIMEOUT
        self.max_tokens = settings.LLM_MAX_TOKENS
        self.temperature = settings.LLM_TEMPERATURE
        self.max_input_chars = settings.LLM_MAX_INPUT_CHARS
        self.retry_count = settings.LLM_RETRY_COUNT
        self.retry_delay = settings.LLM_RETRY_DELAY
        self.retry_backoff = settings.LLM_RETRY_BACKOFF
        self.enable_chunking = settings.ENABLE_CHUNK_PROCESSING

    def _build_system_prompt(self, schema: List[SchemaField]) -> str:
        field_names = [f"'{f.name}'" for f in schema]
        required_fields = [f"'{f.name}'" for f in schema if f.required]
        required_clause = f"特别注意：字段 {', '.join(required_fields)} 是必填项，必须返回有效值，绝对不能缺失或返回null。" if required_fields else ""

        return f"""你是一个专业的信息抽取专家。你的任务是从给定的文本中，按照指定的Schema格式精确抽取信息。

核心要求（必须严格遵守）：
1. 必须返回Schema定义的所有字段：{', '.join(field_names)}，即使某些字段在文本中找不到
2. 严格按照Schema定义的字段名和类型返回结果，字段名必须完全一致
3. 只抽取文本中明确提到的信息，不要编造或推断
4. 如果某个非必填字段在文本中找不到对应信息，返回null
5. 返回格式必须是严格的JSON对象，顶层必须是{{}}包裹，不要包含任何解释性文字、markdown标记或代码块
6. 数组类型字段如果没有数据返回空数组[]
7. 数字类型字段必须返回数字，不要加引号
8. 布尔类型字段必须返回true/false，不要加引号
9. 嵌套对象严格按照定义的结构返回

{required_clause}

示例：
如果Schema定义了["name", "age", "email"]三个字段，即使文本中没有email，也必须返回：
{{"name": "张三", "age": 30, "email": null}}
"""

    def _build_user_prompt(
        self,
        text: str,
        schema: List[SchemaField]
    ) -> str:
        schema_json = json.dumps(
            [field.model_dump() for field in schema],
            ensure_ascii=False,
            indent=2
        )
        all_fields = ", ".join([f'"{f.name}"' for f in schema])
        return f"""
请从以下文本中抽取信息：

```text
{text}
```

请按照以下Schema定义进行抽取：

```json
{schema_json}
```

重要提示：
- 必须包含所有字段：{all_fields}
- 即使文本中没有的信息返回null（非必填）或合理默认值（必填）
- 只返回JSON对象，不要有任何其他文字
- 不要用{{ "字段名": 值 的格式，不要用数组包裹
"""

    def _build_messages(
        self,
        text: str,
        schema: List[SchemaField]
    ) -> List[Dict[str, str]]:
        return [
            {"role": "system", "content": self._build_system_prompt(schema)},
            {"role": "user", "content": self._build_user_prompt(text, schema)}
        ]

    async def extract(
        self,
        text: str,
        schema: List[SchemaField]
    ) -> Dict[str, Any]:
        processed_text = preprocessor.smart_truncate(
            text,
            max_chars=self.max_input_chars,
            schema=schema
        )

        if self.enable_chunking and len(processed_text) > self.max_input_chars * 0.9:
            return await self._extract_with_chunks(text, schema)

        return await self._extract_single(processed_text, schema)

    async def _extract_with_chunks(
        self,
        text: str,
        schema: List[SchemaField]
    ) -> Dict[str, Any]:
        chunks = preprocessor.split_into_chunks(
            text,
            max_chars=self.max_input_chars,
            overlap=200
        )
        logger.info(f"文本过长，拆分为 {len(chunks)} 个块进行处理")

        all_results = []
        raw_responses = []
        total_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        used_model = self.model

        for i, chunk in enumerate(chunks):
            try:
                chunk_result = await self._extract_single(chunk, schema, is_chunk=True)
                all_results.append(chunk_result["result"])
                raw_responses.append(chunk_result["raw_response"])
                usage = chunk_result.get("usage", {})
                for k in total_usage:
                    total_usage[k] += usage.get(k, 0)
                used_model = chunk_result.get("model", used_model)
            except Exception as e:
                logger.warning(f"块 {i+1}/{len(chunks)} 处理失败: {str(e)}")
                continue

        if not all_results:
            raise ValueError("所有文本块处理均失败")

        merged_result = self._merge_chunk_results(all_results, schema)

        validation = formatter.validate_result(merged_result, schema)
        if not validation["valid"]:
            logger.warning(f"分块合并后结果验证失败，尝试补全: {validation['errors']}")
            merged_result = formatter.format(merged_result, schema)

        return {
            "result": merged_result,
            "raw_response": "\n--- CHUNK BOUNDARY ---\n".join(raw_responses),
            "usage": total_usage,
            "model": used_model,
            "chunks_processed": len(all_results),
            "total_chunks": len(chunks)
        }

    def _merge_chunk_results(
        self,
        results: List[Dict[str, Any]],
        schema: List[SchemaField]
    ) -> Dict[str, Any]:
        merged = {}
        schema_dict = {field.name: field for field in schema}

        for field_name, field_schema in schema_dict.items():
            if field_schema.type == "array":
                merged[field_name] = []
                for result in results:
                    val = result.get(field_name)
                    if isinstance(val, list):
                        merged[field_name].extend(val)
                    elif val is not None and val != "":
                        merged[field_name].append(val)
                merged[field_name] = list({str(v): v for v in merged[field_name]}.values())
            else:
                for result in results:
                    val = result.get(field_name)
                    if val is not None and val != "" and val != []:
                        if field_name not in merged or merged[field_name] in (None, "", []):
                            merged[field_name] = val
                        elif field_schema.type == "number":
                            try:
                                if abs(float(val)) > abs(float(merged[field_name])):
                                    merged[field_name] = val
                            except (ValueError, TypeError):
                                pass

        return merged

    async def _extract_single(
        self,
        text: str,
        schema: List[SchemaField],
        is_chunk: bool = False
    ) -> Dict[str, Any]:
        last_exception = None

        for attempt in range(self.retry_count):
            try:
                if attempt > 0:
                    delay = self.retry_delay * (self.retry_backoff ** (attempt - 1))
                    logger.info(f"LLM调用重试 {attempt}/{self.retry_count}，等待 {delay:.1f}s")
                    await asyncio.sleep(delay)

                result = await self._call_llm_api(text, schema)
                parsed_result = self._parse_llm_response(result, schema)

                if not is_chunk:
                    validation = formatter.validate_result(parsed_result, schema)
                    if not validation["valid"]:
                        logger.warning(f"结果验证失败（尝试 {attempt + 1}）: {validation['errors']}")
                        if attempt < self.retry_count - 1:
                            text = self._enhance_prompt_with_validation_errors(text, schema, validation["errors"])
                            continue
                        parsed_result = formatter.format(parsed_result, schema)

                return {
                    "result": parsed_result,
                    "raw_response": result.get("raw_content", ""),
                    "usage": result.get("usage", {}),
                    "model": result.get("model", self.model)
                }

            except Exception as e:
                last_exception = e
                logger.warning(f"LLM调用失败（尝试 {attempt + 1}/{self.retry_count}）: {str(e)}")

                if attempt == self.retry_count - 1:
                    if isinstance(e, httpx.TimeoutException):
                        raise ValueError(f"LLM API请求超时（{self.timeout}秒），已重试{self.retry_count}次")
                    raise

        raise last_exception if last_exception else ValueError("LLM调用失败")

    def _enhance_prompt_with_validation_errors(
        self,
        text: str,
        schema: List[SchemaField],
        errors: List[str]
    ) -> str:
        error_str = "; ".join(errors)
        return f"{text}\n\n【重要提示】上次抽取结果存在以下问题，请修正：{error_str}。请确保所有字段都正确返回。"

    async def _call_llm_api(
        self,
        text: str,
        schema: List[SchemaField]
    ) -> Dict[str, Any]:
        messages = self._build_messages(text, schema)

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(
                    f"{self.api_base}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": self.model,
                        "messages": messages,
                        "max_tokens": self.max_tokens,
                        "temperature": self.temperature,
                        "response_format": {"type": "json_object"}
                    }
                )
                response.raise_for_status()
                result = response.json()

                if "choices" not in result or len(result["choices"]) == 0:
                    raise ValueError("LLM返回结果格式错误，缺少choices字段")

                content = result["choices"][0]["message"]["content"]

                return {
                    "raw_content": content,
                    "usage": result.get("usage", {}),
                    "model": result.get("model", self.model)
                }

            except httpx.HTTPStatusError as e:
                raise ValueError(f"LLM API请求失败: HTTP {e.response.status_code} - {e.response.text}")
            except httpx.TimeoutException:
                raise httpx.TimeoutException(f"请求超时（{self.timeout}秒）")
            except httpx.RequestError as e:
                raise ValueError(f"LLM API请求错误: {str(e)}")

    def _parse_llm_response(
        self,
        llm_result: Dict[str, Any],
        schema: List[SchemaField]
    ) -> Dict[str, Any]:
        content = llm_result["raw_content"]
        raw_response = content

        try:
            parsed_result = json.loads(content)
        except json.JSONDecodeError as e:
            content = self._clean_json_response(content)
            try:
                parsed_result = json.loads(content)
            except json.JSONDecodeError:
                parsed_result = self._repair_json(content, schema)
                if parsed_result is None:
                    raise ValueError(f"无法解析LLM返回的JSON: {str(e)}。原始响应: {raw_response}")

        if not isinstance(parsed_result, dict):
            if isinstance(parsed_result, list) and len(parsed_result) > 0 and isinstance(parsed_result[0], dict):
                parsed_result = parsed_result[0]
            else:
                parsed_result = formatter.format({}, schema)

        parsed_result = self._ensure_all_fields(parsed_result, schema)

        return parsed_result

    def _ensure_all_fields(
        self,
        result: Dict[str, Any],
        schema: List[SchemaField]
    ) -> Dict[str, Any]:
        schema_dict = {field.name: field for field in schema}
        ensured = {}

        for field_name, field_schema in schema_dict.items():
            if field_name in result:
                ensured[field_name] = result[field_name]
            else:
                if field_schema.required:
                    ensured[field_name] = formatter._get_default_for_type(field_schema.type)
                else:
                    ensured[field_name] = None

        for key, value in result.items():
            if key not in ensured:
                ensured[key] = value

        return ensured

    def _repair_json(
        self,
        content: str,
        schema: List[SchemaField]
    ) -> Optional[Dict[str, Any]]:
        try:
            schema_dict = {field.name: field for field in schema}
            result = {}

            for field_name, field_schema in schema_dict.items():
                pattern = rf'["\']?{re.escape(field_name)}["\']?\s*[:=]\s*["\']?([^"\'}},{{\]]+)["\']?'
                match = re.search(pattern, content, re.IGNORECASE)
                if match:
                    value = match.group(1).strip()
                    validator = formatter.type_validators.get(field_schema.type)
                    if validator:
                        try:
                            result[field_name] = validator(value)
                        except Exception:
                            result[field_name] = formatter._get_default_for_type(field_schema.type)
                    else:
                        result[field_name] = value
                else:
                    result[field_name] = formatter._get_default_for_type(field_schema.type)

            if result:
                logger.info("通过正则表达式修复JSON成功")
                return result
        except Exception as e:
            logger.warning(f"JSON修复失败: {str(e)}")

        return None

    def _clean_json_response(self, content: str) -> str:
        content = content.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        brace_start = content.find('{')
        bracket_start = content.find('[')

        if brace_start != -1 and (bracket_start == -1 or brace_start < bracket_start):
            brace_end = content.rfind('}')
            if brace_end != -1:
                content = content[brace_start:brace_end + 1]
        elif bracket_start != -1:
            bracket_end = content.rfind(']')
            if bracket_end != -1:
                content = content[bracket_start:bracket_end + 1]

        return content.strip()


llm_client = LLMClient()
