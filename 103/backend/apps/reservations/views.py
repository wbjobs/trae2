"""
预约管理视图
"""
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from datetime import datetime, timedelta

from .models import Reservation
from .serializers import (
    ReservationSerializer, ReservationCreateSerializer,
    ReservationApproveSerializer, ReservationCalendarSerializer
)
from .services import ReservationService
from common.permissions import IsAdminOrSuperUser, IsOwnerOrAdmin, CanApproveReservation
from common.mixins import AuditLogMixin

import logging

logger = logging.getLogger(__name__)


class ReservationViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = Reservation.objects.all()
    serializer_class = ReservationSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'instrument']
    search_fields = ['purpose', 'experiment_project', 'user__real_name', 'instrument__name']
    ordering_fields = ['created_at', 'start_time']
    ordering = ['-start_time']

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return queryset
        return queryset.filter(user=user)

    def get_serializer_class(self):
        if self.action == 'create':
            return ReservationCreateSerializer
        return super().get_serializer_class()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reservation = ReservationService.create_reservation(serializer.validated_data, request.user)
        return Response({
            'code': 200,
            'message': '预约创建成功',
            'data': ReservationSerializer(reservation).data
        }, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        reservation = ReservationService.update_reservation(
            kwargs['pk'], serializer.validated_data, request.user
        )
        return Response({
            'code': 200,
            'message': '预约更新成功',
            'data': ReservationSerializer(reservation).data
        })

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status in ['pending', 'approved']:
            ReservationService.cancel_reservation(kwargs['pk'], request.user)
            return Response({
                'code': 200,
                'message': '预约已取消',
                'data': None
            })
        return Response({
            'code': 400,
            'message': '该预约无法删除，请使用取消功能',
            'data': None
        }, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsOwnerOrAdmin])
    def cancel(self, request, pk=None):
        reason = request.data.get('reason', '')
        reservation = ReservationService.cancel_reservation(pk, request.user, reason)
        return Response({
            'code': 200,
            'message': '预约已取消',
            'data': ReservationSerializer(reservation).data
        })

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, CanApproveReservation])
    def approve(self, request, pk=None):
        serializer = ReservationApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reservation = ReservationService.approve_reservation(
            pk, serializer.validated_data['action'],
            request.user, serializer.validated_data.get('reason', '')
        )
        return Response({
            'code': 200,
            'message': f'审核成功: {"通过" if serializer.validated_data["action"] == "approve" else "拒绝"}',
            'data': ReservationSerializer(reservation).data
        })

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsOwnerOrAdmin])
    def start(self, request, pk=None):
        reservation = ReservationService.start_reservation(pk, request.user)
        return Response({
            'code': 200,
            'message': '开始使用',
            'data': ReservationSerializer(reservation).data
        })

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsOwnerOrAdmin])
    def complete(self, request, pk=None):
        reservation = ReservationService.complete_reservation(pk, request.user)
        return Response({
            'code': 200,
            'message': '使用结束',
            'data': ReservationSerializer(reservation).data
        })

    @action(detail=False, methods=['get'])
    def my(self, request):
        status_filter = request.query_params.get('status')
        reservations = ReservationService.get_user_reservations(request.user.id, status_filter)
        page = self.paginate_queryset(reservations)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(reservations, many=True)
        return Response({
            'code': 200,
            'message': 'success',
            'data': serializer.data
        })

    @action(detail=False, methods=['get'])
    def calendar(self, request):
        instrument_id = request.query_params.get('instrument_id')
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')

        if not start_date_str:
            start_date = datetime.now().date()
        else:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()

        if not end_date_str:
            end_date = start_date + timedelta(days=13)
        else:
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()

        if instrument_id:
            data = ReservationService.get_calendar_data(instrument_id, start_date, end_date)
        else:
            data = ReservationService.get_my_calendar(request.user, start_date, end_date)

        serialized_data = []
        for item in data:
            serialized_data.append({
                'date': item['date'],
                'reservations': ReservationSerializer(item['reservations'], many=True).data
            })

        return Response({
            'code': 200,
            'message': 'success',
            'data': serialized_data
        })

    @action(detail=False, methods=['get'])
    def stats(self, request):
        stats = ReservationService.get_dashboard_stats(request.user)
        return Response({
            'code': 200,
            'message': 'success',
            'data': stats
        })
