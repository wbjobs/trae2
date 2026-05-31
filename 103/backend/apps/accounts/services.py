"""
用户与权限业务逻辑
"""
from .models import User, Role, Permission, RolePermission
from common.exceptions import NotFoundException, ConflictException, ValidationException
from django.contrib.auth.hashers import make_password
from rest_framework_simplejwt.tokens import RefreshToken
import logging

logger = logging.getLogger(__name__)


class AuthService:
    @staticmethod
    def login(user, request=None):
        refresh = RefreshToken.for_user(user)
        from apps.audit.services import AuditLogService
        try:
            AuditLogService.log(
                user=user,
                action='login',
                module='accounts',
                resource_type='User',
                ip_address=request.META.get('REMOTE_ADDR') if request else None,
                user_agent=request.META.get('HTTP_USER_AGENT') if request else None,
                detail=f'用户登录: {user.username}'
            )
        except Exception as e:
            logger.warning(f'记录登录日志失败: {str(e)}')

        return {
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'token_type': 'Bearer',
            'expires_in': refresh.access_token.lifetime.total_seconds(),
            'user': {
                'id': str(user.id),
                'username': user.username,
                'real_name': user.real_name,
                'email': user.email,
                'role_code': user.role_code,
                'role_name': user.role_name,
                'avatar': user.avatar,
            }
        }

    @staticmethod
    def logout(user, request=None):
        from apps.audit.services import AuditLogService
        try:
            AuditLogService.log(
                user=user,
                action='logout',
                module='accounts',
                resource_type='User',
                ip_address=request.META.get('REMOTE_ADDR') if request else None,
                user_agent=request.META.get('HTTP_USER_AGENT') if request else None,
                detail=f'用户登出: {user.username}'
            )
        except Exception as e:
            logger.warning(f'记录登出日志失败: {str(e)}')


class UserService:
    @staticmethod
    def get_user_by_id(user_id):
        try:
            return User.objects.get(id=user_id)
        except User.DoesNotExist:
            raise NotFoundException(f'用户不存在: {user_id}')

    @staticmethod
    def get_user_by_username(username):
        try:
            return User.objects.get(username=username)
        except User.DoesNotExist:
            raise NotFoundException(f'用户不存在: {username}')

    @staticmethod
    def create_user(data, created_by=None):
        if User.objects.filter(username=data['username']).exists():
            raise ConflictException(f'用户名已存在: {data["username"]}')
        if User.objects.filter(email=data['email']).exists():
            raise ConflictException(f'邮箱已被使用: {data["email"]}')

        user = User(
            username=data['username'],
            email=data['email'],
            real_name=data.get('real_name', data['username']),
            department=data.get('department', ''),
            phone=data.get('phone', ''),
            role_id=data.get('role'),
            is_active=data.get('is_active', True)
        )

        password = data.get('password')
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()

        user.save()
        return user

    @staticmethod
    def update_user(user_id, data, updated_by=None):
        user = UserService.get_user_by_id(user_id)

        if 'username' in data and data['username'] != user.username:
            if User.objects.filter(username=data['username']).exclude(id=user_id).exists():
                raise ConflictException(f'用户名已存在: {data["username"]}')

        if 'email' in data and data['email'] != user.email:
            if User.objects.filter(email=data['email']).exclude(id=user_id).exists():
                raise ConflictException(f'邮箱已被使用: {data["email"]}')

        for field in ['username', 'email', 'real_name', 'department', 'phone', 'avatar', 'role', 'is_active']:
            if field in data:
                setattr(user, field, data[field])

        if 'password' in data and data['password']:
            user.set_password(data['password'])

        user.save()
        return user

    @staticmethod
    def delete_user(user_id, deleted_by=None):
        user = UserService.get_user_by_id(user_id)
        if user.is_superuser:
            raise ValidationException('不能删除超级管理员')
        if deleted_by and str(deleted_by.id) == str(user_id):
            raise ValidationException('不能删除自己')
        user.delete()

    @staticmethod
    def toggle_active(user_id):
        user = UserService.get_user_by_id(user_id)
        if user.is_superuser:
            raise ValidationException('不能禁用超级管理员')
        user.is_active = not user.is_active
        user.save()
        return user

    @staticmethod
    def change_password(user, old_password, new_password):
        if not user.check_password(old_password):
            raise ValidationException('旧密码不正确')
        user.set_password(new_password)
        user.save()
        return user

    @staticmethod
    def reset_password(user_id, new_password, operator=None):
        user = UserService.get_user_by_id(user_id)
        user.set_password(new_password)
        user.save()
        return user


class RoleService:
    @staticmethod
    def get_role_by_id(role_id):
        try:
            return Role.objects.get(id=role_id)
        except Role.DoesNotExist:
            raise NotFoundException(f'角色不存在: {role_id}')

    @staticmethod
    def create_role(data, created_by=None):
        if Role.objects.filter(code=data['code']).exists():
            raise ConflictException(f'角色编码已存在: {data["code"]}')

        role = Role(
            name=data['name'],
            code=data['code'],
            description=data.get('description', '')
        )
        role.save()
        return role

    @staticmethod
    def update_role(role_id, data, updated_by=None):
        role = RoleService.get_role_by_id(role_id)
        if role.is_system:
            raise ValidationException('系统角色不能修改')

        if 'code' in data and data['code'] != role.code:
            if Role.objects.filter(code=data['code']).exclude(id=role_id).exists():
                raise ConflictException(f'角色编码已存在: {data["code"]}')

        for field in ['name', 'code', 'description']:
            if field in data:
                setattr(role, field, data[field])

        role.save()
        return role

    @staticmethod
    def delete_role(role_id, deleted_by=None):
        role = RoleService.get_role_by_id(role_id)
        if role.is_system:
            raise ValidationException('系统角色不能删除')
        if User.objects.filter(role_id=role_id).exists():
            raise ConflictException('该角色下还有用户，无法删除')
        role.delete()

    @staticmethod
    def update_role_permissions(role_id, permission_ids):
        role = RoleService.get_role_by_id(role_id)
        if role.is_system:
            raise ValidationException('系统角色权限不能修改')

        RolePermission.objects.filter(role=role).delete()

        role_permissions = [
            RolePermission(role=role, permission_id=pid)
            for pid in permission_ids
        ]
        RolePermission.objects.bulk_create(role_permissions)

        return role

    @staticmethod
    def get_role_users(role_id):
        return User.objects.filter(role_id=role_id)


class PermissionService:
    @staticmethod
    def get_all_permissions():
        return Permission.objects.all()

    @staticmethod
    def get_permissions_by_module():
        permissions = Permission.objects.all()
        result = {}
        for perm in permissions:
            if perm.module not in result:
                result[perm.module] = []
            result[perm.module].append({
                'id': str(perm.id),
                'code': perm.code,
                'name': perm.name,
                'module': perm.module
            })
        return result

    @staticmethod
    def get_user_permissions(user):
        return list(user.get_all_permissions())

    @staticmethod
    def has_permission(user, permission_code):
        return user.has_permission(permission_code)

    @staticmethod
    def initialize_permissions():
        default_permissions = [
            {'module': 'dashboard', 'name': '查看仪表盘', 'code': 'dashboard:view'},
            {'module': 'instruments', 'name': '查看仪器', 'code': 'instruments:view'},
            {'module': 'instruments', 'name': '创建仪器', 'code': 'instruments:create'},
            {'module': 'instruments', 'name': '编辑仪器', 'code': 'instruments:edit'},
            {'module': 'instruments', 'name': '删除仪器', 'code': 'instruments:delete'},
            {'module': 'reservations', 'name': '查看预约', 'code': 'reservations:view'},
            {'module': 'reservations', 'name': '创建预约', 'code': 'reservations:create'},
            {'module': 'reservations', 'name': '编辑预约', 'code': 'reservations:edit'},
            {'module': 'reservations', 'name': '取消预约', 'code': 'reservations:cancel'},
            {'module': 'reservations', 'name': '审核预约', 'code': 'reservations:approve'},
            {'module': 'records', 'name': '查看记录', 'code': 'records:view'},
            {'module': 'records', 'name': '创建记录', 'code': 'records:create'},
            {'module': 'records', 'name': '编辑记录', 'code': 'records:edit'},
            {'module': 'records', 'name': '删除记录', 'code': 'records:delete'},
            {'module': 'files', 'name': '查看文件', 'code': 'files:view'},
            {'module': 'files', 'name': '上传文件', 'code': 'files:upload'},
            {'module': 'files', 'name': '下载文件', 'code': 'files:download'},
            {'module': 'files', 'name': '删除文件', 'code': 'files:delete'},
            {'module': 'notifications', 'name': '查看通知', 'code': 'notifications:view'},
            {'module': 'notifications', 'name': '发送通知', 'code': 'notifications:send'},
            {'module': 'audit', 'name': '查看审计日志', 'code': 'audit:view'},
            {'module': 'system', 'name': '用户管理', 'code': 'system:users:manage'},
            {'module': 'system', 'name': '角色管理', 'code': 'system:roles:manage'},
            {'module': 'system', 'name': '系统设置', 'code': 'system:settings:manage'},
        ]

        for perm_data in default_permissions:
            Permission.objects.get_or_create(
                code=perm_data['code'],
                defaults=perm_data
            )
        logger.info('权限初始化完成')

    @staticmethod
    def initialize_roles():
        default_roles = [
            {'code': 'super_admin', 'name': '超级管理员', 'is_system': True,
             'description': '拥有系统所有权限'},
            {'code': 'admin', 'name': '实验室管理员', 'is_system': True,
             'description': '管理仪器、审核预约、管理用户'},
            {'code': 'researcher', 'name': '科研人员', 'is_system': True,
             'description': '预约仪器、使用仪器、上传实验文件'},
            {'code': 'user', 'name': '普通用户', 'is_system': True,
             'description': '查看仪器、申请预约'},
        ]

        for role_data in default_roles:
            Role.objects.get_or_create(
                code=role_data['code'],
                defaults=role_data
            )

        super_admin_role = Role.objects.get(code='super_admin')
        admin_role = Role.objects.get(code='admin')
        researcher_role = Role.objects.get(code='researcher')
        user_role = Role.objects.get(code='user')

        all_permissions = list(Permission.objects.all())
        admin_permissions = [p for p in all_permissions if p.code not in ['system:settings:manage']]
        researcher_permissions = [p for p in all_permissions if p.module in
                                   ['dashboard', 'instruments', 'reservations', 'records', 'files', 'notifications']
                                   and p.code not in ['instruments:create', 'instruments:edit', 'instruments:delete',
                                                      'reservations:approve', 'records:delete', 'files:delete']]
        user_permissions = [p for p in all_permissions if p.module in
                            ['dashboard', 'instruments', 'reservations', 'notifications']
                            and p.code in ['dashboard:view', 'instruments:view',
                                           'reservations:view', 'reservations:create', 'reservations:cancel',
                                           'notifications:view']]

        def set_role_permissions(role, permissions):
            RolePermission.objects.filter(role=role).delete()
            for perm in permissions:
                RolePermission.objects.create(role=role, permission=perm)

        set_role_permissions(super_admin_role, all_permissions)
        set_role_permissions(admin_role, admin_permissions)
        set_role_permissions(researcher_role, researcher_permissions)
        set_role_permissions(user_role, user_permissions)

        logger.info('角色初始化完成')

    @staticmethod
    def initialize_superuser():
        if not User.objects.filter(username='admin').exists():
            role = Role.objects.get(code='super_admin')
            User.objects.create_superuser(
                username='admin',
                email='admin@lab.edu.cn',
                password='admin123',
                real_name='系统管理员',
                role=role,
                is_staff=True,
                is_active=True,
                department='系统管理部'
            )
            logger.info('超级管理员创建完成: admin/admin123')
