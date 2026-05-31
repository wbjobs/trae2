from typing import Any, Dict, Optional
from fastapi import HTTPException, status


class AppException(HTTPException):
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    default_detail = "服务器内部错误"
    default_code = "INTERNAL_ERROR"

    def __init__(
        self,
        detail: Optional[str] = None,
        code: Optional[str] = None,
        status_code: Optional[int] = None,
        headers: Optional[Dict[str, Any]] = None,
    ):
        self.status_code = status_code or self.status_code
        self.detail = detail or self.default_detail
        self.code = code or self.default_code
        self.headers = headers

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} code={self.code} detail={self.detail}>"


class NotFoundException(AppException):
    status_code = status.HTTP_404_NOT_FOUND
    default_detail = "资源不存在"
    default_code = "NOT_FOUND"


class BadRequestException(AppException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "请求参数错误"
    default_code = "BAD_REQUEST"


class UnauthorizedException(AppException):
    status_code = status.HTTP_401_UNAUTHORIZED
    default_detail = "未授权访问"
    default_code = "UNAUTHORIZED"


class ForbiddenException(AppException):
    status_code = status.HTTP_403_FORBIDDEN
    default_detail = "权限不足"
    default_code = "FORBIDDEN"


class ConflictException(AppException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "资源冲突"
    default_code = "CONFLICT"


class FileTooLargeException(BadRequestException):
    default_detail = "文件大小超过限制"
    default_code = "FILE_TOO_LARGE"


class UnsupportedFileTypeException(BadRequestException):
    default_detail = "不支持的文件类型"
    default_code = "UNSUPPORTED_FILE_TYPE"


class AIServiceException(AppException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "AI服务不可用"
    default_code = "AI_SERVICE_ERROR"


class TaskNotFoundException(NotFoundException):
    default_detail = "任务不存在"
    default_code = "TASK_NOT_FOUND"


class DocumentParseException(AppException):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    default_detail = "文档解析失败"
    default_code = "DOCUMENT_PARSE_ERROR"
