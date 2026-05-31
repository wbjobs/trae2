"""
用户与权限视图
"""
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import User, Role, Permission
from .serializers import (
    LoginSerializer, UserProfileSerializer, UserSerializer,
    RoleSerializer, PermissionSerializer, RolePermissionUpdateSerializer,
    ChangePasswordSerializer, UserSimpleSerializer
)
from .services import AuthService, UserService, RoleService, PermissionService
from common.permissions import IsAdminOrSuperUser, IsOwnerOrAdmin
from common.mixins import AuditLogMixin, ToggleActiveMixin
from common.exceptions import ForbiddenException

import logging

logger = logging.getLogger(__name__)


@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.validated_data['user']
    result = AuthService.login(user, request)
    return Response({
        'code': 200,
        'message': '登录成功',
        'data': result
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout(request):
    AuthService.logout(request.user, request)
    return Response({
        'code': 200,
        'message': '登出成功',
        'data': None
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_profile(request):
    serializer = UserProfileSerializer(request.user)
    return Response({
        'code': 200,
        'message': 'success',
        'data': serializer.data
    })


@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def update_profile(request):
    serializer = UserProfileSerializer(request.user, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response({
        'code': 200,
        'message': '更新成功',
        'data': serializer.data
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password(request):
    serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response({
        'code': 200,
        'message': '密码修改成功',
        'data': None
    })


class UserViewSet(AuditLogMixin, ToggleActiveMixin, viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated, IsAdminOrSuperUser]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['role', 'is_active', 'department']
    search_fields = ['username', 'real_name', 'email', 'phone']
    ordering_fields = ['created_at', 'username']
    ordering = ['-created_at']

    def get_permissions(self):
        if self.action in ['retrieve', 'list']:
            return [IsAuthenticated()]
        if self.action in ['update', 'partial_update']:
            return [IsAuthenticated(), IsOwnerOrAdmin()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == 'list':
            return UserSimpleSerializer
        return super().get_serializer_class()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = UserService.create_user(serializer.validated_data, request.user)
        headers = self.get_success_headers(serializer.data)
        return Response({
            'code': 200,
            'message': '创建成功',
            'data': UserSerializer(user).data
        }, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        user = UserService.update_user(kwargs['pk'], serializer.validated_data, request.user)
        return Response({
            'code': 200,
            'message': '更新成功',
            'data': UserSerializer(user).data
        })

    def destroy(self, request, *args, **kwargs):
        UserService.delete_user(kwargs['pk'], request.user)
        return Response({
            'code': 200,
            'message': '删除成功',
            'data': None
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def me(self, request):
        serializer = UserProfileSerializer(request.user)
        return Response({
            'code': 200,
            'message': 'success',
            'data': serializer.data
        })

    @action(detail=True, methods=['post'])
    def reset_password(self, request, pk=None):
        new_password = request.data.get('password')
        if not new_password:
            return Response({
                'code': 400,
                'message': '新密码不能为空',
                'data': None
            }, status=status.HTTP_400_BAD_REQUEST)
        UserService.reset_password(pk, new_password, request.user)
        return Response({
            'code': 200,
            'message': '密码重置成功',
            'data': None
        })


class RoleViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    permission_classes = [IsAuthenticated, IsAdminOrSuperUser]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_system']
    search_fields = ['name', 'code']
    ordering_fields = ['created_at', 'name']
    ordering = ['-created_at']

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role = RoleService.create_role(serializer.validated_data, request.user)
        return Response({
            'code': 200,
            'message': '创建成功',
            'data': RoleSerializer(role).data
        }, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        role = RoleService.update_role(kwargs['pk'], serializer.validated_data, request.user)
        return Response({
            'code': 200,
            'message': '更新成功',
            'data': RoleSerializer(role).data
        })

    def destroy(self, request, *args, **kwargs):
        RoleService.delete_role(kwargs['pk'], request.user)
        return Response({
            'code': 200,
            'message': '删除成功',
            'data': None
        })

    @action(detail=True, methods=['get'])
    def users(self, request, pk=None):
        users = RoleService.get_role_users(pk)
        serializer = UserSimpleSerializer(users, many=True)
        return Response({
            'code': 200,
            'message': 'success',
            'data': serializer.data
        })

    @action(detail=True, methods=['post'])
    def permissions(self, request, pk=None):
        serializer = RolePermissionUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role = RoleService.update_role_permissions(pk, serializer.validated_data['permission_ids'])
        return Response({
            'code': 200,
            'message': '权限更新成功',
            'data': RoleSerializer(role).data
        })


class PermissionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Permission.objects.all()
    serializer_class = PermissionSerializer
    permission_classes = [IsAuthenticated, IsAdminOrSuperUser]

    @action(detail=False, methods=['get'])
    def tree(self, request):
        result = PermissionService.get_permissions_by_module()
        return Response({
            'code': 200,
            'message': 'success',
            'data': result
        })

    @action(detail=False, methods=['get'])
    def my(self, request):
        permissions = PermissionService.get_user_permissions(request.user)
        return Response({
            'code': 200,
            'message': 'success',
            'data': permissions
        })


@api_view(['POST'])
@permission_classes([IsAdminOrSuperUser])
def initialize_system(request):
    try:
        PermissionService.initialize_permissions()
        PermissionService.initialize_roles()
        PermissionService.initialize_superuser()
        return Response({
            'code': 200,
            'message': '系统初始化成功',
            'data': None
        })
    except Exception as e:
        logger.error(f'系统初始化失败: {str(e)}')
        return Response({
            'code': 500,
            'message': f'初始化失败: {str(e)}',
            'data': None
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
