"""
用户与权限数据模型
"""
import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.utils import timezone


class Role(models.Model):
    ROLE_CHOICES = (
        ('super_admin', '超级管理员'),
        ('admin', '实验室管理员'),
        ('researcher', '科研人员'),
        ('user', '普通用户'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField('角色名称', max_length=50)
    code = models.CharField('角色编码', max_length=50, unique=True, choices=ROLE_CHOICES)
    description = models.TextField('描述', blank=True)
    is_system = models.BooleanField('系统角色', default=False)
    created_at = models.DateTimeField('创建时间', default=timezone.now)

    class Meta:
        db_table = 'roles'
        verbose_name = '角色'
        verbose_name_plural = '角色'

    def __str__(self):
        return self.name


class Permission(models.Model):
    MODULE_CHOICES = (
        ('dashboard', '仪表盘'),
        ('instruments', '仪器管理'),
        ('reservations', '预约管理'),
        ('records', '使用记录'),
        ('files', '文件管理'),
        ('notifications', '消息通知'),
        ('audit', '审计日志'),
        ('system', '系统管理'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField('权限名称', max_length=100)
    code = models.CharField('权限编码', max_length=100, unique=True)
    module = models.CharField('所属模块', max_length=50, choices=MODULE_CHOICES)
    created_at = models.DateTimeField('创建时间', default=timezone.now)

    class Meta:
        db_table = 'permissions'
        verbose_name = '权限'
        verbose_name_plural = '权限'

    def __str__(self):
        return f'{self.module}:{self.name}'


class RolePermission(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='role_permissions')
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE)
    created_at = models.DateTimeField('创建时间', default=timezone.now)

    class Meta:
        db_table = 'role_permissions'
        unique_together = ('role', 'permission')


class UserManager(BaseUserManager):
    def create_user(self, username, email, password=None, **extra_fields):
        if not username:
            raise ValueError('用户名必须设置')
        if not email:
            raise ValueError('邮箱必须设置')

        email = self.normalize_email(email)
        user = self.model(username=username, email=email, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, username, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('超级用户必须设置 is_staff=True')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('超级用户必须设置 is_superuser=True')

        return self.create_user(username, email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = models.CharField('用户名', max_length=50, unique=True)
    email = models.EmailField('邮箱', max_length=100, unique=True)
    real_name = models.CharField('真实姓名', max_length=50)
    department = models.CharField('所属部门', max_length=100, blank=True)
    phone = models.CharField('联系电话', max_length=20, blank=True)
    avatar = models.CharField('头像', max_length=255, blank=True)
    role = models.ForeignKey(Role, on_delete=models.SET_NULL, null=True, blank=True, related_name='users')
    is_staff = models.BooleanField('是否员工', default=False)
    is_active = models.BooleanField('是否启用', default=True)
    is_superuser = models.BooleanField('是否超级管理员', default=False)
    created_at = models.DateTimeField('创建时间', default=timezone.now)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = ['email', 'real_name']

    class Meta:
        db_table = 'users'
        verbose_name = '用户'
        verbose_name_plural = '用户'

    def __str__(self):
        return f'{self.real_name} ({self.username})'

    def has_permission(self, permission_code):
        if self.is_superuser or self.is_staff:
            return True
        if not self.role:
            return False
        return RolePermission.objects.filter(
            role=self.role,
            permission__code=permission_code
        ).exists()

    def get_all_permissions(self):
        if self.is_superuser or self.is_staff:
            return Permission.objects.values_list('code', flat=True)
        if not self.role:
            return []
        return Permission.objects.filter(
            rolepermission__role=self.role
        ).values_list('code', flat=True)

    @property
    def role_name(self):
        return self.role.name if self.role else '无'

    @property
    def role_code(self):
        return self.role.code if self.role else 'user'
