"""
仪器管理视图
"""
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from datetime import datetime

from .models import Instrument, InstrumentCategory, InstrumentMaintenance
from .serializers import (
    InstrumentSerializer, InstrumentSimpleSerializer, InstrumentDetailSerializer,
    InstrumentCategorySerializer, InstrumentMaintenanceSerializer, TimeSlotSerializer
)
from .services import InstrumentService, InstrumentCategoryService, InstrumentMaintenanceService
from common.permissions import IsAdminOrSuperUser, IsResearcher
from common.mixins import AuditLogMixin, ToggleActiveMixin

import logging

logger = logging.getLogger(__name__)


class InstrumentCategoryViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = InstrumentCategory.objects.all()
    serializer_class = InstrumentCategorySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [SearchFilter]
    search_fields = ['name', 'code']
    ordering_fields = ['created_at', 'name']
    ordering = ['-created_at']

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsAdminOrSuperUser()]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        category = InstrumentCategoryService.create_category(serializer.validated_data, request.user)
        return Response({
            'code': 200,
            'message': '创建成功',
            'data': InstrumentCategorySerializer(category).data
        }, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        category = InstrumentCategoryService.update_category(kwargs['pk'], serializer.validated_data, request.user)
        return Response({
            'code': 200,
            'message': '更新成功',
            'data': InstrumentCategorySerializer(category).data
        })

    def destroy(self, request, *args, **kwargs):
        InstrumentCategoryService.delete_category(kwargs['pk'], request.user)
        return Response({
            'code': 200,
            'message': '删除成功',
            'data': None
        })


class InstrumentViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = Instrument.objects.all()
    serializer_class = InstrumentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'category', 'requires_approval']
    search_fields = ['name', 'code', 'model', 'manufacturer', 'location']
    ordering_fields = ['created_at', 'name', 'code']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return InstrumentSimpleSerializer
        if self.action == 'retrieve':
            return InstrumentDetailSerializer
        return super().get_serializer_class()

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'slots', 'smart_slots', 'peak_hours']:
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsAdminOrSuperUser()]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instrument = InstrumentService.create_instrument(serializer.validated_data, request.user)
        return Response({
            'code': 200,
            'message': '创建成功',
            'data': InstrumentSerializer(instrument).data
        }, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        instrument = InstrumentService.update_instrument(kwargs['pk'], serializer.validated_data, request.user)
        return Response({
            'code': 200,
            'message': '更新成功',
            'data': InstrumentSerializer(instrument).data
        })

    def destroy(self, request, *args, **kwargs):
        InstrumentService.delete_instrument(kwargs['pk'], request.user)
        return Response({
            'code': 200,
            'message': '删除成功',
            'data': None
        })

    @action(detail=True, methods=['get'])
    def slots(self, request, pk=None):
        date_str = request.query_params.get('date')
        if not date_str:
            date = datetime.now().date()
        else:
            try:
                date = datetime.strptime(date_str, '%Y-%m-%d').date()
            except ValueError:
                return Response({
                    'code': 400,
                    'message': '日期格式错误，请使用 YYYY-MM-DD 格式',
                    'data': None
                }, status=status.HTTP_400_BAD_REQUEST)

        slots = InstrumentService.get_available_slots(pk, date)
        return Response({
            'code': 200,
            'message': 'success',
            'data': slots
        })

    @action(detail=True, methods=['get'])
    def smart_slots(self, request, pk=None):
        date_str = request.query_params.get('date')
        duration_str = request.query_params.get('duration_hours')

        if not date_str:
            return Response({
                'code': 400,
                'message': 'date 参数不能为空',
                'data': None
            }, status=status.HTTP_400_BAD_REQUEST)

        if not duration_str:
            return Response({
                'code': 400,
                'message': 'duration_hours 参数不能为空',
                'data': None
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return Response({
                'code': 400,
                'message': '日期格式错误，请使用 YYYY-MM-DD 格式',
                'data': None
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            duration_hours = float(duration_str)
            if duration_hours <= 0:
                raise ValueError()
        except ValueError:
            return Response({
                'code': 400,
                'message': 'duration_hours 必须为正数',
                'data': None
            }, status=status.HTTP_400_BAD_REQUEST)

        recommendations = InstrumentService.smart_recommend(pk, date, duration_hours)
        return Response({
            'code': 200,
            'message': 'success',
            'data': recommendations
        })

    @action(detail=True, methods=['get'])
    def peak_hours(self, request, pk=None):
        days_str = request.query_params.get('days', '30')
        try:
            days = int(days_str)
            if days <= 0:
                raise ValueError()
        except ValueError:
            return Response({
                'code': 400,
                'message': 'days 必须为正整数',
                'data': None
            }, status=status.HTTP_400_BAD_REQUEST)

        peak_data = InstrumentService.get_peak_hours(pk, days)
        return Response({
            'code': 200,
            'message': 'success',
            'data': peak_data
        })

    @action(detail=True, methods=['post'])
    def change_status(self, request, pk=None):
        status_val = request.data.get('status')
        if not status_val:
            return Response({
                'code': 400,
                'message': '状态不能为空',
                'data': None
            }, status=status.HTTP_400_BAD_REQUEST)
        instrument = InstrumentService.toggle_status(pk, status_val)
        return Response({
            'code': 200,
            'message': '状态更新成功',
            'data': {'status': instrument.status}
        })

    @action(detail=False, methods=['get'])
    def stats(self, request):
        stats = InstrumentService.get_dashboard_stats()
        return Response({
            'code': 200,
            'message': 'success',
            'data': stats
        })

    @action(detail=False, methods=['get'])
    def available(self, request):
        instruments = InstrumentService.get_available_instruments()
        serializer = InstrumentSimpleSerializer(instruments, many=True)
        return Response({
            'code': 200,
            'message': 'success',
            'data': serializer.data
        })


class InstrumentMaintenanceViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = InstrumentMaintenance.objects.all()
    serializer_class = InstrumentMaintenanceSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['instrument', 'type', 'status']
    search_fields = ['title', 'description', 'operator']
    ordering_fields = ['scheduled_date', 'created_at']
    ordering = ['-scheduled_date']

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsAdminOrSuperUser()]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        maintenance = InstrumentMaintenanceService.create_maintenance(serializer.validated_data, request.user)
        return Response({
            'code': 200,
            'message': '创建成功',
            'data': InstrumentMaintenanceSerializer(maintenance).data
        }, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        maintenance = InstrumentMaintenanceService.update_maintenance(kwargs['pk'], serializer.validated_data, request.user)
        return Response({
            'code': 200,
            'message': '更新成功',
            'data': InstrumentMaintenanceSerializer(maintenance).data
        })

    def destroy(self, request, *args, **kwargs):
        InstrumentMaintenanceService.delete_maintenance(kwargs['pk'], request.user)
        return Response({
            'code': 200,
            'message': '删除成功',
            'data': None
        })

    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        status_val = request.data.get('status')
        remarks = request.data.get('remarks', '')
        if not status_val:
            return Response({
                'code': 400,
                'message': '状态不能为空',
                'data': None
            }, status=status.HTTP_400_BAD_REQUEST)
        maintenance = InstrumentMaintenanceService.update_status(pk, status_val, remarks)
        return Response({
            'code': 200,
            'message': '状态更新成功',
            'data': InstrumentMaintenanceSerializer(maintenance).data
        })
