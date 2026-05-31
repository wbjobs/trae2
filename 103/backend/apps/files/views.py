"""
文件存储视图
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import File
from .serializers import (
    FileSerializer, FileSimpleSerializer, FileCreateSerializer,
    FileUpdateSerializer, FileUploadConfirmSerializer, FileNewVersionSerializer,
    FileVersionSerializer, FileDownloadLogSerializer
)
from .services import FileService
from common.permissions import IsAdminOrSuperUser, IsOwnerOrAdmin
from common.mixins import AuditLogMixin

import logging

logger = logging.getLogger(__name__)


class FileViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = File.objects.all()
    serializer_class = FileSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['category', 'instrument', 'use_record']
    search_fields = ['name', 'original_name', 'description', 'tags']
    ordering_fields = ['created_at', 'size', 'name', 'download_count']
    ordering = ['-created_at']

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return queryset
        return queryset.filter(uploaded_by=user)

    def get_serializer_class(self):
        if self.action == 'list':
            return FileSimpleSerializer
        if self.action == 'update' or self.action == 'partial_update':
            return FileUpdateSerializer
        return super().get_serializer_class()

    def create(self, request, *args, **kwargs):
        serializer = FileCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = FileService.create_upload_url(
            original_name=serializer.validated_data['original_name'],
            content_type=serializer.validated_data.get('content_type'),
            size=serializer.validated_data.get('size', 0),
            instrument_id=serializer.validated_data.get('instrument_id'),
            use_record_id=serializer.validated_data.get('use_record_id'),
            description=serializer.validated_data.get('description', ''),
            tags=serializer.validated_data.get('tags', ''),
            user=request.user
        )
        return Response({
            'code': 200,
            'message': '上传地址创建成功',
            'data': result
        }, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        file = FileService.update_file(kwargs['pk'], serializer.validated_data, request.user)
        return Response({
            'code': 200,
            'message': '更新成功',
            'data': FileSerializer(file).data
        })

    def destroy(self, request, *args, **kwargs):
        FileService.delete_file(kwargs['pk'], request.user)
        return Response({
            'code': 200,
            'message': '删除成功',
            'data': None
        })

    @action(detail=False, methods=['post'])
    def confirm_upload(self, request):
        serializer = FileUploadConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        file = FileService.confirm_upload(
            file_id=str(serializer.validated_data['file_id']),
            etag=serializer.validated_data.get('etag', ''),
            size=serializer.validated_data.get('size', 0),
            user=request.user
        )
        return Response({
            'code': 200,
            'message': '上传确认成功',
            'data': FileSerializer(file).data
        })

    @action(detail=True, methods=['post'])
    def new_version(self, request, pk=None):
        serializer = FileNewVersionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = FileService.create_new_version(
            file_id=pk,
            original_name=serializer.validated_data['original_name'],
            content_type=serializer.validated_data.get('content_type'),
            size=serializer.validated_data.get('size', 0),
            user=request.user,
            change_log=serializer.validated_data.get('change_log', '')
        )
        return Response({
            'code': 200,
            'message': '新版本创建成功',
            'data': result
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        result = FileService.get_download_url(pk, request.user, request)
        return Response({
            'code': 200,
            'message': 'success',
            'data': result
        })

    @action(detail=True, methods=['get'])
    def preview(self, request, pk=None):
        result = FileService.get_preview_url(pk, request.user)
        return Response({
            'code': 200,
            'message': 'success',
            'data': result
        })

    @action(detail=True, methods=['get'])
    def versions(self, request, pk=None):
        versions = FileService.get_file_versions(pk)
        serializer = FileVersionSerializer(versions, many=True)
        return Response({
            'code': 200,
            'message': 'success',
            'data': serializer.data
        })

    @action(detail=True, methods=['get'])
    def download_logs(self, request, pk=None):
        logs = FileService.get_download_logs(pk)
        page = self.paginate_queryset(logs)
        if page is not None:
            serializer = FileDownloadLogSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = FileDownloadLogSerializer(logs, many=True)
        return Response({
            'code': 200,
            'message': 'success',
            'data': serializer.data
        })

    @action(detail=False, methods=['get'])
    def my(self, request):
        category = request.query_params.get('category')
        instrument_id = request.query_params.get('instrument_id')
        use_record_id = request.query_params.get('use_record_id')

        files = FileService.get_user_files(
            request.user.id, category, instrument_id, use_record_id
        )
        page = self.paginate_queryset(files)
        if page is not None:
            serializer = FileSimpleSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = FileSimpleSerializer(files, many=True)
        return Response({
            'code': 200,
            'message': 'success',
            'data': serializer.data
        })

    @action(detail=False, methods=['get'])
    def stats(self, request):
        stats = FileService.get_dashboard_stats(request.user)
        return Response({
            'code': 200,
            'message': 'success',
            'data': stats
        })
