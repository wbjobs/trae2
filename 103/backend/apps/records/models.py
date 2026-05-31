"""
使用记录数据模型
"""
import uuid
from django.db import models
from django.utils import timezone


class UseRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reservation = models.ForeignKey('reservations.Reservation', on_delete=models.SET_NULL,
                                    null=True, blank=True, related_name='use_records')
    instrument = models.ForeignKey('instruments.Instrument', on_delete=models.CASCADE, related_name='use_records')
    user = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='use_records')
    start_time = models.DateTimeField('开始时间')
    end_time = models.DateTimeField('结束时间', null=True, blank=True)
    experiment_content = models.TextField('实验内容', blank=True)
    sample_info = models.TextField('样品信息', blank=True)
    result_summary = models.TextField('结果摘要', blank=True)
    anomalies = models.TextField('异常情况', blank=True)
    usage_duration = models.FloatField('使用时长(小时)', default=0)
    created_at = models.DateTimeField('创建时间', default=timezone.now)

    class Meta:
        db_table = 'use_records'
        verbose_name = '使用记录'
        verbose_name_plural = '使用记录'
        ordering = ['-start_time']
        indexes = [
            models.Index(fields=['instrument_id']),
            models.Index(fields=['user_id']),
            models.Index(fields=['start_time']),
        ]

    def __str__(self):
        return f'{self.instrument.name} - {self.user.real_name} ({self.start_time.strftime("%Y-%m-%d")})'

    def save(self, *args, **kwargs):
        if self.start_time and self.end_time:
            self.usage_duration = round(
                (self.end_time - self.start_time).total_seconds() / 3600, 2
            )
        super().save(*args, **kwargs)


class InstrumentEvaluation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    instrument = models.ForeignKey('instruments.Instrument', on_delete=models.CASCADE, related_name='evaluations')
    use_record = models.ForeignKey(UseRecord, on_delete=models.SET_NULL, null=True, blank=True, related_name='evaluations')
    user = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='instrument_evaluations')
    rating = models.IntegerField('评分')
    content = models.TextField('评价内容', blank=True)
    tags = models.CharField('评价标签', max_length=255, blank=True)
    created_at = models.DateTimeField('创建时间', default=timezone.now)

    class Meta:
        db_table = 'instrument_evaluations'
        verbose_name = '仪器使用评价'
        verbose_name_plural = '仪器使用评价'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['instrument_id']),
            models.Index(fields=['user_id']),
        ]

    def __str__(self):
        return f'{self.instrument.name} - {self.user.real_name} ({self.rating}分)'


class ViolationRecord(models.Model):
    VIOLATION_TYPE_CHOICES = [
        ('late_cancel', '超时取消'),
        ('no_show', '未到场'),
        ('equipment_damage', '设备损坏'),
        ('rule_violation', '违规操作'),
        ('unauthorized_use', '未授权使用'),
        ('other', '其他'),
    ]
    SEVERITY_CHOICES = [
        ('minor', '轻微'),
        ('moderate', '一般'),
        ('major', '严重'),
        ('critical', '极严重'),
    ]
    STATUS_CHOICES = [
        ('pending', '待处理'),
        ('confirmed', '已确认'),
        ('appealed', '已申诉'),
        ('dismissed', '已驳回'),
        ('resolved', '已处理'),
    ]
    PENALTY_CHOICES = [
        ('warning', '警告'),
        ('suspend_1d', '停用1天'),
        ('suspend_3d', '停用3天'),
        ('suspend_7d', '停用7天'),
        ('suspend_30d', '停用30天'),
        ('ban', '永久禁止'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    instrument = models.ForeignKey('instruments.Instrument', on_delete=models.CASCADE, related_name='violations')
    use_record = models.ForeignKey(UseRecord, on_delete=models.SET_NULL, null=True, blank=True, related_name='violations')
    user = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='violations')
    reported_by = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='reported_violations')
    violation_type = models.CharField('违规类型', max_length=20, choices=VIOLATION_TYPE_CHOICES)
    severity = models.CharField('严重程度', max_length=10, choices=SEVERITY_CHOICES)
    description = models.TextField('违规描述')
    status = models.CharField('处理状态', max_length=10, choices=STATUS_CHOICES, default='pending')
    penalty = models.CharField('处罚措施', max_length=15, choices=PENALTY_CHOICES, blank=True)
    appeal_reason = models.TextField('申诉理由', blank=True)
    resolved_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='resolved_violations')
    resolved_at = models.DateTimeField('处理时间', null=True, blank=True)
    created_at = models.DateTimeField('创建时间', default=timezone.now)

    class Meta:
        db_table = 'violation_records'
        verbose_name = '违规使用标记'
        verbose_name_plural = '违规使用标记'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['instrument_id']),
            models.Index(fields=['user_id']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f'{self.user.real_name} - {self.get_violation_type_display()}'
