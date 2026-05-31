"""
操作审计视图
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser

from common.pagination import StandardPagination
from common.permissions import IsAdminOrSuperUser
from .models import AuditLog
from .serializers import AuditLogSerializer, AuditLogStatsSerializer
from .services import AuditLogService


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdminOrSuperUser]
    pagination_class = StandardPagination

    def get_queryset(self):
        queryset = super().get_queryset()
        action = self.request.query_params.get('action')
        module = self.request.query_params.get('module')
        user_id = self.request.query_params.get('user_id')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        keyword = self.request.query_params.get('keyword')

        return AuditLogService.get_all_logs(
            action=action,
            module=module,
            user_id=user_id,
            start_date=start_date,
            end_date=end_date,
            keyword=keyword
        )

    @action(detail=False, methods=['get'])
    def stats(self, request):
        days = int(request.query_params.get('days', 30))
        stats = AuditLogService.get_stats(days=days)
        serializer = AuditLogStatsSerializer(stats)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def mine(self, request):
        logs = AuditLogService.get_user_logs(user_id=request.user.id)
        page = self.paginate_queryset(logs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(logs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def resource(self, request, pk=None):
        resource_type = request.query_params.get('resource_type')
        action = request.query_params.get('action')
        logs = AuditLogService.get_resource_logs(
            resource_type=resource_type,
            resource_id=pk,
            action=action
        )
        serializer = self.get_serializer(logs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def clean(self, request):
        days = int(request.data.get('days', 90))
        count = AuditLogService.clean_old_logs(days=days)
        return Response({'message': f'成功清理 {count} 条审计日志'})
