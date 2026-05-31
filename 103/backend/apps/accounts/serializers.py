"""
用户与权限序列化器
"""
from rest_framework import serializers
from django.contrib.auth import authenticate
from .models import User, Role, Permission, RolePermission


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(required=True, max_length=50)
    password = serializers.CharField(required=True, max_length=128, write_only=True)

    def validate(self, attrs):
        user = authenticate(username=attrs['username'], password=attrs['password'])
        if not user:
            raise serializers.ValidationError('用户名或密码错误')
        if not user.is_active:
            raise serializers.ValidationError('账号已被禁用')
        attrs['user'] = user
        return attrs


class UserSimpleSerializer(serializers.ModelSerializer):
    role_name = serializers.CharField(read_only=True)
    role_code = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'real_name', 'email', 'avatar', 'role_name', 'role_code', 'department']


class UserProfileSerializer(serializers.ModelSerializer):
    role_name = serializers.CharField(read_only=True)
    role_code = serializers.CharField(read_only=True)
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'real_name', 'department', 'phone', 'avatar',
                  'role_name', 'role_code', 'is_active', 'permissions', 'created_at']
        read_only_fields = ['username', 'email', 'is_active', 'created_at']

    def get_permissions(self, obj):
        return list(obj.get_all_permissions())


class UserSerializer(serializers.ModelSerializer):
    role_name = serializers.CharField(read_only=True)
    role_code = serializers.CharField(read_only=True)
    password = serializers.CharField(write_only=True, required=False, max_length=128)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'real_name', 'department', 'phone', 'avatar',
                  'role', 'role_name', 'role_code', 'is_active', 'password', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class RoleSerializer(serializers.ModelSerializer):
    user_count = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = ['id', 'name', 'code', 'description', 'is_system', 'user_count', 'permissions', 'created_at']
        read_only_fields = ['is_system', 'created_at']

    def get_user_count(self, obj):
        return obj.users.count()

    def get_permissions(self, obj):
        return list(Permission.objects.filter(
            rolepermission__role=obj
        ).values('id', 'code', 'name', 'module'))


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ['id', 'name', 'code', 'module', 'created_at']


class RolePermissionUpdateSerializer(serializers.Serializer):
    permission_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=True
    )

    def validate_permission_ids(self, value):
        existing_count = Permission.objects.filter(id__in=value).count()
        if existing_count != len(value):
            raise serializers.ValidationError('存在无效的权限ID')
        return value

    def save(self, **kwargs):
        role = kwargs.get('role')
        permission_ids = self.validated_data['permission_ids']

        RolePermission.objects.filter(role=role).delete()

        role_permissions = [
            RolePermission(role=role, permission_id=pid)
            for pid in permission_ids
        ]
        RolePermission.objects.bulk_create(role_permissions)

        return role


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True, max_length=128, write_only=True)
    new_password = serializers.CharField(required=True, max_length=128, write_only=True)
    confirm_password = serializers.CharField(required=True, max_length=128, write_only=True)

    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('旧密码不正确')
        return value

    def validate(self, attrs):
        if attrs['new_password'] != attrs['confirm_password']:
            raise serializers.ValidationError('两次输入的密码不一致')
        return attrs

    def save(self, **kwargs):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save()
        return user
