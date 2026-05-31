"""
自定义权限类
"""
from rest_framework.permissions import BasePermission, SAFE_METHODS, IsAdminUser
from django.conf import settings


class IsAdminOrSuperUser(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and (request.user.is_staff or request.user.is_superuser))


class IsLabAdmin(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role and request.user.role.code in ['admin', 'lab_admin', 'super_admin']


class IsResearcher(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role and request.user.role.code in ['admin', 'lab_admin', 'super_admin', 'researcher']


class IsOwnerOrAdmin(BasePermission):
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.role and request.user.role.code in ['admin', 'lab_admin', 'super_admin']:
            return True

        if hasattr(obj, 'user'):
            return obj.user == request.user
        if hasattr(obj, 'user_id'):
            return obj.user_id == request.user.id
        if hasattr(obj, 'uploaded_by'):
            return obj.uploaded_by == request.user

        return False


class CanApproveReservation(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role and request.user.role.code in ['admin', 'lab_admin', 'super_admin']


class ReadOnly(BasePermission):
    def has_permission(self, request, view):
        return request.method in SAFE_METHODS


class HasPermission(BasePermission):
    permission_code = None

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.role and request.user.role.code in ['admin', 'super_admin']:
            return True

        if self.permission_code:
            return request.user.has_permission(self.permission_code)

        return True


def has_permission(permission_code):
    class DynamicPermission(HasPermission):
        def __init__(self):
            self.permission_code = permission_code
    return DynamicPermission
