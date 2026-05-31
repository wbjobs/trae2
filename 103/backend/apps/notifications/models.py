"""
消息通知数据模型
"""
import uuid
from django.db import models
from django.utils import timezone


class Notification(models.Model):
    TYPE_CHOICES = (
        ('reservation', '预约通知'),
        ('approval', '审批通知'),
        ('system', '系统公告'),
        ('message', '站内信'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='notifications')
    type = models.CharField('消息类型', max_length=20, choices=TYPE_CHOICES)
    title = models.CharField('标题', max_length=200)
    content = models.TextField('内容')
    data = models.JSONField('附加数据', null=True, blank=True)
    is_read = models.BooleanField('是否已读', default=False)
    read_at = models.DateTimeField('阅读时间', null=True, blank=True)
    created_at = models.DateTimeField('创建时间', default=timezone.now)

    class Meta:
        db_table = 'notifications'
        verbose_name = '消息通知'
        verbose_name_plural = '消息通知'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user_id', 'is_read']),
            models.Index(fields=['type']),
        ]

    def __str__(self):
        return f'{self.user.real_name} - {self.title}'

    @property
    def type_text(self):
        return dict(self.TYPE_CHOICES).get(self.type, self.type)

    def mark_as_read(self):
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save()
