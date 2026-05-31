from typing import Any, Optional, Dict, List
from sanic import json


class AppException(Exception):
    def __init__(self, message: str, code: int = 400, details: Optional[Dict[str, Any]] = None):
        self.message = message
        self.code = code
        self.details = details or {}
        super().__init__(self.message)


class NotFoundException(AppException):
    def __init__(self, message: str = "资源不存在", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, 404, details)


class UnauthorizedException(AppException):
    def __init__(self, message: str = "未授权访问", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, 401, details)


class ForbiddenException(AppException):
    def __init__(self, message: str = "无权限访问", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, 403, details)


class BadRequestException(AppException):
    def __init__(self, message: str = "请求参数错误", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, 400, details)


class ConflictException(AppException):
    def __init__(self, message: str = "资源冲突", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, 409, details)


class InternalErrorException(AppException):
    def __init__(self, message: str = "服务器内部错误", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, 500, details)


def success(data: Any = None, message: str = "操作成功", code: int = 0):
    return json({
        "code": code,
        "message": message,
        "data": data
    }, status=200)


def error_response(exception: AppException):
    return json({
        "code": exception.code,
        "message": exception.message,
        "data": None,
        "details": exception.details
    }, status=exception.code if exception.code < 600 else 500)


def paginated_response(items: List[Any], total: int, page: int, page_size: int, message: str = "查询成功"):
    return json({
        "code": 0,
        "message": message,
        "data": {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size if page_size > 0 else 0
        }
    }, status=200)
