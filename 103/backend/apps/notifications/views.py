"""
消息通知视图
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import Notification
from .serializers import (
    NotificationSerializer, NotificationCreateSerializer,
    NotificationSendMessageSerializer, NotificationUnreadCountSerializer,
    NotificationStatsSerializer
)
from .services import NotificationService
from apps.accounts.models import User
from common.permissions import IsAdminOrSuperUser

import logging

logger = logging.getLogger(__name__)


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['type', 'is_read']
    search_fields = ['title', 'content']
    ordering_fields = ['created_at']
    ordering = ['-created_at']

    def get_queryset(self):
        queryset = super().get_queryset()
        return queryset.filter(user=self.request.user)

    @action(detail=True, methods=['post'])
    def read(self, request, pk=None):
        notification = NotificationService.mark_as_read(pk, request.user)
        return Response({
            'code': 200,
            'message': 'success',
            'data': NotificationSerializer(notification).data
        })

    @action(detail=True, methods=['delete'])
    def delete(self, request, pk=None):
        NotificationService.delete_notification(pk, request.user)
        return Response({
            'code': 200,
            'message': '删除成功',
            'data': None
        })

    @action(detail=False, methods=['get'])
    def my(self, request):
        type_filter = request.query_params.get('type')
        is_read = request.query_params.get('is_read')

        if is_read is not None:
            is_read = is_read.lower() == 'true'

        notifications = NotificationService.get_user_notifications(
            request.user.id, type_filter, is_read
        )
        page = self.paginate_queryset(notifications)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(notifications, many=True)
        return Response({
            'code': 200,
            'message': 'success',
            'data': serializer.data
        })

    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        count = NotificationService.get_unread_count_by_type(request.user)
        return Response({
            'code': 200,
            'message': 'success',
            'data': count
        })

    @action(detail=False, methods=['post'])
    def read_all(self, request):
        count = NotificationService.mark_all_as_read(request.user)
        return Response({
            'code': 200,
            'message': f'已标记 {count} 条通知为已读',
            'data': {'count': count}
        })

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated, IsAdminOrSuperUser])
    def broadcast(self, request):
        serializer = NotificationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user_ids = serializer.validated_data.get('user_ids')
        if user_ids:
            users = User.objects.filter(id__in=user_ids)
        else:
            users = User.objects.filter(is_active=True)

        notifications = NotificationService.broadcast_system_notification(
            users=users,
            title=serializer.validated_data['title'],
            content=serializer.validated_data['content'],
            data=serializer.validated_data.get('data')
        )

        return Response({
            'code': 200,
            'message': f'已发送 {len(notifications)} 条通知',
            'data': {'count': len(notifications)}
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def send_message(self, request):
        serializer = NotificationSendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            receiver = User.objects.get(id=serializer.validated_data['receiver_id'])
        except User.DoesNotExist:
            return Response({
                'code': 404,
                'message': '接收用户不存在',
                'data': None
            }, status=status.HTTP_404_NOT_FOUND)

        notification = NotificationService.create_private_message(
            sender=request.user,
            receiver=receiver,
            title=serializer.validated_data['title'],
            content=serializer.validated_data['content']
        )

        return Response({
            'code': 200,
            'message': '消息发送成功',
            'data': NotificationSerializer(notification).data
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        from django.utils import timezone
        today = timezone.now().date()

        total = Notification.objects.filter(user=request.user).count()
        unread = Notification.objects.filter(user=request.user, is_read=False).count()
        today_count = Notification.objects.filter(
            user=request.user,
            created_at__date=today
        ).count()

        return Response({
            'code': 200,
            'message': 'success',
            'data': {
                'total': total,
                'unread': unread,
                'today': today_count
            }
        })
