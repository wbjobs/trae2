"""
操作审计业务逻辑
"""
from .models import AuditLog
from common.exceptions import NotFoundException
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


class AuditLogService:
    @staticmethod
    def get_log_by_id(log_id):
        try:
            return AuditLog.objects.get(id=log_id)
        except AuditLog.DoesNotExist:
            raise NotFoundException(f'审计日志不存在: {log_id}')

    @staticmethod
    def log(user=None, action='other', module='other', resource_type='',
            resource_id=None, detail='', old_value=None, new_value=None,
            ip_address='', user_agent=''):
        try:
            log = AuditLog(
                user=user,
                action=action,
                module=module,
                resource_type=resource_type,
                resource_id=resource_id,
                detail=detail,
                old_value=old_value,
                new_value=new_value,
                ip_address=ip_address,
                user_agent=user_agent
            )
            log.save()
            return log
        except Exception as e:
            logger.error(f'记录审计日志失败: {str(e)}')
            return None

    @staticmethod
    def log_with_request(request, action='other', module='other', resource_type='',
                        resource_id=None, detail='', old_value=None, new_value=None):
        ip_address = request.META.get('REMOTE_ADDR', '') if request else ''
        user_agent = request.META.get('HTTP_USER_AGENT', '') if request else ''
        user = request.user if request and hasattr(request, 'user') and request.user.is_authenticated else None

        return AuditLogService.log(
            user=user,
            action=action,
            module=module,
            resource_type=resource_type,
            resource_id=resource_id,
            detail=detail,
            old_value=old_value,
            new_value=new_value,
            ip_address=ip_address,
            user_agent=user_agent
        )

    @staticmethod
    def get_user_logs(user_id, action=None, module=None, start_date=None, end_date=None):
        logs = AuditLog.objects.filter(user_id=user_id)
        if action:
            logs = logs.filter(action=action)
        if module:
            logs = logs.filter(module=module)
        if start_date:
            logs = logs.filter(created_at__date__gte=start_date)
        if end_date:
            logs = logs.filter(created_at__date__lte=end_date)
        return logs.order_by('-created_at')

    @staticmethod
    def get_module_logs(module, action=None, start_date=None, end_date=None):
        logs = AuditLog.objects.filter(module=module)
        if action:
            logs = logs.filter(action=action)
        if start_date:
            logs = logs.filter(created_at__date__gte=start_date)
        if end_date:
            logs = logs.filter(created_at__date__lte=end_date)
        return logs.order_by('-created_at')

    @staticmethod
    def get_resource_logs(resource_type, resource_id, action=None):
        logs = AuditLog.objects.filter(resource_type=resource_type, resource_id=resource_id)
        if action:
            logs = logs.filter(action=action)
        return logs.order_by('-created_at')

    @staticmethod
    def get_all_logs(action=None, module=None, user_id=None,
                     start_date=None, end_date=None, keyword=None):
        logs = AuditLog.objects.all()
        if action:
            logs = logs.filter(action=action)
        if module:
            logs = logs.filter(module=module)
        if user_id:
            logs = logs.filter(user_id=user_id)
        if start_date:
            logs = logs.filter(created_at__date__gte=start_date)
        if end_date:
            logs = logs.filter(created_at__date__lte=end_date)
        if keyword:
            logs = logs.filter(detail__icontains=keyword)
        return logs.order_by('-created_at')

    @staticmethod
    def get_stats(days=30):
        from datetime import timedelta
        end_date = timezone.now()
        start_date = end_date - timedelta(days=days - 1)

        logs = AuditLog.objects.filter(created_at__gte=start_date)

        total = logs.count()
        by_action = {}
        by_module = {}

        for action_code, action_name in AuditLog.ACTION_CHOICES:
            by_action[action_code] = logs.filter(action=action_code).count()

        for module_code, module_name in AuditLog.MODULE_CHOICES:
            by_module[module_code] = logs.filter(module=module_code).count()

        daily_stats = {}
        for i in range(days):
            date = (start_date + timedelta(days=i)).date()
            daily_stats[date.strftime('%Y-%m-%d')] = logs.filter(
                created_at__date=date
            ).count()

        return {
            'total': total,
            'by_action': by_action,
            'by_module': by_module,
            'daily_stats': daily_stats
        }

    @staticmethod
    def clean_old_logs(days=90):
        from datetime import timedelta
        cutoff_date = timezone.now() - timedelta(days=days)
        deleted = AuditLog.objects.filter(created_at__lt=cutoff_date).delete()
        logger.info(f'清理了 {deleted[0]} 条 {days} 天前的审计日志')
        return deleted[0]
