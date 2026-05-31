"""
使用记录视图
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from datetime import datetime

from .models import UseRecord
from .serializers import (
    UseRecordSerializer, UseRecordCreateSerializer,
    UseRecordDetailSerializer, UseRecordStatsSerializer,
    InstrumentEvaluationSerializer, InstrumentEvaluationCreateSerializer,
    ViolationRecordSerializer, ViolationRecordCreateSerializer,
    ViolationAppealSerializer, ViolationResolveSerializer
)
from .services import UseRecordService, EvaluationService, ViolationService
from common.permissions import IsAdminOrSuperUser, IsOwnerOrAdmin
from common.mixins import AuditLogMixin

import logging

logger = logging.getLogger(__name__)


class UseRecordViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = UseRecord.objects.all()
    serializer_class = UseRecordSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['instrument', 'user']
    search_fields = ['experiment_content', 'sample_info', 'result_summary',
                     'instrument__name', 'user__real_name']
    ordering_fields = ['created_at', 'start_time', 'usage_duration']
    ordering = ['-start_time']

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return queryset
        return queryset.filter(user=user)

    def get_serializer_class(self):
        if self.action == 'create':
            return UseRecordCreateSerializer
        if self.action == 'retrieve':
            return UseRecordDetailSerializer
        return super().get_serializer_class()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        record = UseRecordService.create_record(serializer.validated_data, request.user)
        return Response({
            'code': 200,
            'message': '创建成功',
            'data': UseRecordSerializer(record).data
        }, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        record = UseRecordService.update_record(
            kwargs['pk'], serializer.validated_data, request.user
        )
        return Response({
            'code': 200,
            'message': '更新成功',
            'data': UseRecordSerializer(record).data
        })

    def destroy(self, request, *args, **kwargs):
        UseRecordService.delete_record(kwargs['pk'], request.user)
        return Response({
            'code': 200,
            'message': '删除成功',
            'data': None
        })

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        record = UseRecordService.complete_record(pk, request.data, request.user)
        return Response({
            'code': 200,
            'message': '记录已完成',
            'data': UseRecordDetailSerializer(record).data
        })

    @action(detail=False, methods=['post'])
    def from_reservation(self, request):
        reservation_id = request.data.get('reservation_id')
        if not reservation_id:
            return Response({
                'code': 400,
                'message': 'reservation_id 不能为空',
                'data': None
            }, status=status.HTTP_400_BAD_REQUEST)
        record = UseRecordService.create_from_reservation(reservation_id, request.user)
        return Response({
            'code': 200,
            'message': '创建成功',
            'data': UseRecordDetailSerializer(record).data
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def my(self, request):
        instrument_id = request.query_params.get('instrument_id')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        if start_date:
            start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
        if end_date:
            end_date = datetime.strptime(end_date, '%Y-%m-%d').date()

        records = UseRecordService.get_user_records(
            request.user.id, instrument_id, start_date, end_date
        )
        page = self.paginate_queryset(records)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(records, many=True)
        return Response({
            'code': 200,
            'message': 'success',
            'data': serializer.data
        })

    @action(detail=False, methods=['get'])
    def stats(self, request):
        stats = UseRecordService.get_dashboard_stats(request.user)
        return Response({
            'code': 200,
            'message': 'success',
            'data': stats
        })

    @action(detail=False, methods=['get'])
    def usage_trend(self, request):
        days = int(request.query_params.get('days', 30))
        data = UseRecordService.get_user_usage_stats(request.user.id, days)
        return Response({
            'code': 200,
            'message': 'success',
            'data': data
        })

    @action(detail=True, methods=['get'])
    def instrument_usage(self, request, pk=None):
        days = int(request.query_params.get('days', 30))
        data = UseRecordService.get_instrument_usage_stats(pk, days)
        return Response({
            'code': 200,
            'message': 'success',
            'data': data
        })

    @action(detail=True, methods=['post'])
    def evaluate(self, request, pk=None):
        record = self.get_object()
        serializer = InstrumentEvaluationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        validated['instrument'] = record.instrument
        validated['use_record'] = record
        validated['user'] = record.user
        evaluation = EvaluationService.create_evaluation(validated, request.user)
        return Response({
            'code': 200,
            'message': '评价成功',
            'data': InstrumentEvaluationSerializer(evaluation).data
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def flag_violation(self, request, pk=None):
        record = self.get_object()
        serializer = ViolationRecordCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        validated['instrument'] = record.instrument
        validated['use_record'] = record
        validated['user'] = record.user
        violation = ViolationService.create_violation(validated, request.user)
        return Response({
            'code': 200,
            'message': '违规标记成功',
            'data': ViolationRecordSerializer(violation).data
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def evaluations(self, request, pk=None):
        evaluations = EvaluationService.get_record_evaluations(pk)
        page = self.paginate_queryset(evaluations)
        if page is not None:
            serializer = InstrumentEvaluationSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = InstrumentEvaluationSerializer(evaluations, many=True)
        return Response({
            'code': 200,
            'message': 'success',
            'data': serializer.data
        })

    @action(detail=True, methods=['get'])
    def violations(self, request, pk=None):
        violations = ViolationService.get_record_violations(pk)
        serializer = ViolationRecordSerializer(violations, many=True)
        return Response({
            'code': 200,
            'message': 'success',
            'data': serializer.data
        })
