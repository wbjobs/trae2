"""
操作审计数据模型
"""
import uuid
from django.db import models
from django.utils import timezone


class AuditLog(models.Model):
    ACTION_CHOICES = (
        ('create', '创建'),
        ('update', '更新'),
        ('delete', '删除'),
        ('login', '登录'),
        ('logout', '登出'),
        ('approve', '审核'),
        ('reject', '拒绝'),
        ('cancel', '取消'),
        ('download', '下载'),
        ('upload', '上传'),
        ('view', '查看'),
        ('export', '导出'),
        ('import', '导入'),
        ('other', '其他'),
    )

    MODULE_CHOICES = (
        ('accounts', '用户管理'),
        ('instruments', '仪器管理'),
        ('reservations', '预约管理'),
        ('records', '使用记录'),
        ('files', '文件管理'),
        ('notifications', '消息通知'),
        ('audit', '审计日志'),
        ('system', '系统设置'),
        ('other', '其他'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey('accounts.User', on_delete=models.SET_NULL,
                             null=True, blank=True, related_name='audit_logs')
    action = models.CharField('操作类型', max_length=20, choices=ACTION_CHOICES, default='other')
    module = models.CharField('所属模块', max_length=20, choices=MODULE_CHOICES, default='other')
    resource_type = models.CharField('资源类型', max_length=100, blank=True)
    resource_id = models.UUIDField('资源ID', null=True, blank=True)
    detail = models.TextField('操作详情', blank=True)
    old_value = models.JSONField('旧值', null=True, blank=True)
    new_value = models.JSONField('新值', null=True, blank=True)
    ip_address = models.CharField('IP地址', max_length=50, blank=True)
    user_agent = models.TextField('User Agent', blank=True)
    created_at = models.DateTimeField('操作时间', default=timezone.now)

    class Meta:
        db_table = 'audit_logs'
        verbose_name = '操作日志'
        verbose_name_plural = '操作日志'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user_id']),
            models.Index(fields=['action']),
            models.Index(fields=['module']),
            models.Index(fields=['resource_type', 'resource_id']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f'{self.user.real_name if self.user else "系统"} - {self.get_action_display()} - {self.get_module_display()}'

    @property
    def action_text(self):
        return dict(self.ACTION_CHOICES).get(self.action, self.action)

    @property
    def module_text(self):
        return dict(self.MODULE_CHOICES).get(self.module, self.module)

    @property
    def user_name(self):
        return self.user.real_name if self.user else '系统'
