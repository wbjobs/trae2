"""
消息通知序列化器
"""
from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    type_text = serializers.CharField(read_only=True)

    class Meta:
        model = Notification
        fields = [
            'id', 'type', 'type_text', 'title', 'content',
            'data', 'is_read', 'read_at', 'created_at'
        ]
        read_only_fields = ['created_at', 'read_at']


class NotificationCreateSerializer(serializers.Serializer):
    user_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        help_text='接收用户ID列表，不填则发送给所有用户'
    )
    type = serializers.ChoiceField(choices=Notification.TYPE_CHOICES, required=True)
    title = serializers.CharField(required=True, max_length=200)
    content = serializers.CharField(required=True)
    data = serializers.JSONField(required=False, allow_null=True)


class NotificationSendMessageSerializer(serializers.Serializer):
    receiver_id = serializers.UUIDField(required=True)
    title = serializers.CharField(required=True, max_length=200)
    content = serializers.CharField(required=True)


class NotificationUnreadCountSerializer(serializers.Serializer):
    all = serializers.IntegerField()
    reservation = serializers.IntegerField()
    approval = serializers.IntegerField()
    system = serializers.IntegerField()
    message = serializers.IntegerField()


class NotificationStatsSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    unread = serializers.IntegerField()
    today = serializers.IntegerField()
