"""
消息通知业务逻辑
"""
from .models import Notification
from common.exceptions import NotFoundException
from django.utils import timezone
from django.conf import settings
import logging
import json

logger = logging.getLogger(__name__)


class NotificationService:
    @staticmethod
    def get_notification_by_id(notification_id):
        try:
            return Notification.objects.get(id=notification_id)
        except Notification.DoesNotExist:
            raise NotFoundException(f'通知不存在: {notification_id}')

    @staticmethod
    def create_notification(user, type, title, content, data=None):
        notification = Notification(
            user=user,
            type=type,
            title=title,
            content=content,
            data=data
        )
        notification.save()
        return notification

    @staticmethod
    def create_reservation_notification(reservation):
        user = reservation.user
        instrument = reservation.instrument

        title = '预约提交成功'
        content = f'您已成功预约 {instrument.name}，使用时间：{reservation.start_time.strftime("%Y-%m-%d %H:%M")} - {reservation.end_time.strftime("%H:%M")}'

        if instrument.requires_approval:
            title = '预约待审核'
            content = f'您提交的 {instrument.name} 预约已提交，等待管理员审核。使用时间：{reservation.start_time.strftime("%Y-%m-%d %H:%M")} - {reservation.end_time.strftime("%H:%M")}'

        data = {
            'reservation_id': str(reservation.id),
            'instrument_id': str(instrument.id),
            'instrument_name': instrument.name,
            'start_time': reservation.start_time.isoformat(),
            'end_time': reservation.end_time.isoformat(),
            'status': reservation.status
        }

        return NotificationService.create_notification(
            user=user,
            type='reservation',
            title=title,
            content=content,
            data=data
        )

    @staticmethod
    def create_approval_notification(reservation, action, reason=''):
        user = reservation.user
        instrument = reservation.instrument

        if action == 'approve':
            title = '预约已通过'
            content = f'您的 {instrument.name} 预约已通过审核。使用时间：{reservation.start_time.strftime("%Y-%m-%d %H:%M")} - {reservation.end_time.strftime("%H:%M")}'
        else:
            title = '预约已拒绝'
            content = f'您的 {instrument.name} 预约未通过审核。原因：{reason or "未说明"}'

        data = {
            'reservation_id': str(reservation.id),
            'instrument_id': str(instrument.id),
            'instrument_name': instrument.name,
            'action': action,
            'reason': reason
        }

        return NotificationService.create_notification(
            user=user,
            type='approval',
            title=title,
            content=content,
            data=data
        )

    @staticmethod
    def create_cancel_notification(reservation):
        user = reservation.user
        instrument = reservation.instrument

        title = '预约已取消'
        content = f'您已取消 {instrument.name} 的预约。原使用时间：{reservation.start_time.strftime("%Y-%m-%d %H:%M")} - {reservation.end_time.strftime("%H:%M")}'

        data = {
            'reservation_id': str(reservation.id),
            'instrument_id': str(instrument.id),
            'instrument_name': instrument.name,
            'cancel_reason': reservation.cancel_reason
        }

        return NotificationService.create_notification(
            user=user,
            type='reservation',
            title=title,
            content=content,
            data=data
        )

    @staticmethod
    def create_system_notification(user, title, content, data=None):
        return NotificationService.create_notification(
            user=user,
            type='system',
            title=title,
            content=content,
            data=data
        )

    @staticmethod
    def create_private_message(sender, receiver, title, content):
        data = {
            'sender_id': str(sender.id),
            'sender_name': sender.real_name
        }
        return NotificationService.create_notification(
            user=receiver,
            type='message',
            title=title,
            content=content,
            data=data
        )

    @staticmethod
    def broadcast_system_notification(users, title, content, data=None):
        notifications = []
        for user in users:
            notification = Notification(
                user=user,
                type='system',
                title=title,
                content=content,
                data=data
            )
            notifications.append(notification)

        Notification.objects.bulk_create(notifications)
        logger.info(f'已发送 {len(notifications)} 条系统通知')
        return notifications

    @staticmethod
    def get_user_notifications(user_id, type=None, is_read=None):
        notifications = Notification.objects.filter(user_id=user_id)
        if type:
            notifications = notifications.filter(type=type)
        if is_read is not None:
            notifications = notifications.filter(is_read=is_read)
        return notifications.order_by('-created_at')

    @staticmethod
    def mark_as_read(notification_id, user):
        notification = NotificationService.get_notification_by_id(notification_id)

        if str(notification.user.id) != str(user.id) and not user.is_staff:
            raise Exception('只能标记自己的通知为已读')

        notification.mark_as_read()
        return notification

    @staticmethod
    def mark_all_as_read(user):
        count = Notification.objects.filter(user=user, is_read=False).update(
            is_read=True,
            read_at=timezone.now()
        )
        return count

    @staticmethod
    def get_unread_count(user):
        return Notification.objects.filter(user=user, is_read=False).count()

    @staticmethod
    def get_unread_count_by_type(user):
        counts = {}
        for type_code, type_name in Notification.TYPE_CHOICES:
            counts[type_code] = Notification.objects.filter(
                user=user,
                type=type_code,
                is_read=False
            ).count()
        counts['all'] = sum(counts.values())
        return counts

    @staticmethod
    def delete_notification(notification_id, user):
        notification = NotificationService.get_notification_by_id(notification_id)

        if str(notification.user.id) != str(user.id) and not user.is_staff:
            raise Exception('只能删除自己的通知')

        notification.delete()

    @staticmethod
    def clean_old_notifications(days=30):
        from datetime import timedelta
        cutoff_date = timezone.now() - timedelta(days=days)
        deleted = Notification.objects.filter(
            created_at__lt=cutoff_date,
            is_read=True
        ).delete()
        logger.info(f'清理了 {deleted[0]} 条 {days} 天前的已读通知')
        return deleted[0]
