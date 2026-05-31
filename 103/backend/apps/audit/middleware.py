"""
审计日志中间件
自动记录用户操作
"""
from .services import AuditLogService
import logging

logger = logging.getLogger(__name__)


class AuditLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.method_action_map = {
            'POST': 'create',
            'PUT': 'update',
            'PATCH': 'update',
            'DELETE': 'delete',
            'GET': 'view',
        }
        self.path_module_map = {
            '/api/accounts/': 'accounts',
            '/api/instruments/': 'instruments',
            '/api/reservations/': 'reservations',
            '/api/records/': 'records',
            '/api/files/': 'files',
            '/api/notifications/': 'notifications',
            '/api/audit/': 'audit',
        }
        self.exclude_paths = [
            '/api/auth/login/',
            '/api/auth/logout/',
            '/api/notifications/unread/',
        ]

    def __call__(self, request):
        response = self.get_response(request)

        try:
            if request.method in ['POST', 'PUT', 'PATCH', 'DELETE']:
                path = request.path
                if any(path.startswith(exclude) for exclude in self.exclude_paths):
                    return response

                module = 'other'
                for prefix, mod in self.path_module_map.items():
                    if path.startswith(prefix):
                        module = mod
                        break

                action = self.method_action_map.get(request.method, 'other')

                resource_type = self._extract_resource_type(path, module)
                resource_id = self._extract_resource_id(path)

                detail = f'{request.method} {path}'

                if request.user and request.user.is_authenticated:
                    AuditLogService.log_with_request(
                        request=request,
                        action=action,
                        module=module,
                        resource_type=resource_type,
                        resource_id=resource_id,
                        detail=detail,
                    )
        except Exception as e:
            logger.warning(f'自动记录审计日志失败: {str(e)}')

        return response

    def _extract_resource_type(self, path, module):
        parts = [p for p in path.split('/') if p]
        api_parts = [p for p in parts if p not in ['api', module]]
        if api_parts:
            return api_parts[0]
        return module

    def _extract_resource_id(self, path):
        import re
        from uuid import UUID
        parts = path.split('/')
        for part in parts:
            try:
                return UUID(part)
            except (ValueError, TypeError):
                continue
        return None
