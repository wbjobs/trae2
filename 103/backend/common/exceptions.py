"""
自定义异常处理
"""
from rest_framework.views import exception_handler
from rest_framework.exceptions import APIException
from rest_framework import status
from django.db import DatabaseError
from django.core.exceptions import PermissionDenied, ObjectDoesNotExist
from rest_framework.response import Response
import logging

logger = logging.getLogger(__name__)


class BusinessException(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = '业务异常'
    default_code = 'business_error'

    def __init__(self, detail=None, code=None, status_code=None):
        self.detail = detail or self.default_detail
        self.code = code or self.default_code
        if status_code:
            self.status_code = status_code


class NotFoundException(BusinessException):
    status_code = status.HTTP_404_NOT_FOUND
    default_detail = '资源不存在'
    default_code = 'not_found'


class ConflictException(BusinessException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = '资源冲突'
    default_code = 'conflict'


class ValidationException(BusinessException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = '参数验证失败'
    default_code = 'validation_error'


class ForbiddenException(BusinessException):
    status_code = status.HTTP_403_FORBIDDEN
    default_detail = '没有权限执行此操作'
    default_code = 'forbidden'


class UnauthorizedException(BusinessException):
    status_code = status.HTTP_401_UNAUTHORIZED
    default_detail = '身份验证失败'
    default_code = 'unauthorized'


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is not None:
        custom_data = {
            'code': response.status_code,
            'message': str(exc.detail) if hasattr(exc, 'detail') else str(exc),
            'data': None
        }
        if isinstance(response.data, dict) and 'detail' in response.data:
            custom_data['message'] = str(response.data['detail'])
        elif isinstance(response.data, dict):
            custom_data['errors'] = response.data
        response.data = custom_data
        return response

    if isinstance(exc, DatabaseError):
        logger.error(f'Database error: {str(exc)}')
        return Response({
            'code': status.HTTP_500_INTERNAL_SERVER_ERROR,
            'message': '数据库操作异常',
            'data': None
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    if isinstance(exc, PermissionDenied):
        return Response({
            'code': status.HTTP_403_FORBIDDEN,
            'message': '没有权限执行此操作',
            'data': None
        }, status=status.HTTP_403_FORBIDDEN)

    if isinstance(exc, ObjectDoesNotExist):
        return Response({
            'code': status.HTTP_404_NOT_FOUND,
            'message': '资源不存在',
            'data': None
        }, status=status.HTTP_404_NOT_FOUND)

    logger.exception(f'Unhandled exception: {str(exc)}')
    return Response({
        'code': status.HTTP_500_INTERNAL_SERVER_ERROR,
        'message': '服务器内部错误',
        'data': None
    }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
