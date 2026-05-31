"""
预约管理数据模型
"""
import uuid
from django.db import models
from django.utils import timezone


class Reservation(models.Model):
    STATUS_CHOICES = (
        ('pending', '待审核'),
        ('approved', '已批准'),
        ('rejected', '已拒绝'),
        ('cancelled', '已取消'),
        ('in_progress', '进行中'),
        ('completed', '已完成'),
        ('expired', '已过期'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='reservations')
    instrument = models.ForeignKey('instruments.Instrument', on_delete=models.CASCADE, related_name='reservations')
    start_time = models.DateTimeField('开始时间')
    end_time = models.DateTimeField('结束时间')
    purpose = models.TextField('使用目的')
    experiment_project = models.CharField('实验项目', max_length=200, blank=True)
    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='pending')
    approved_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL,
                                    null=True, blank=True, related_name='approved_reservations')
    approved_at = models.DateTimeField('审核时间', null=True, blank=True)
    reject_reason = models.TextField('拒绝原因', blank=True)
    cancel_reason = models.TextField('取消原因', blank=True)
    cancelled_at = models.DateTimeField('取消时间', null=True, blank=True)
    cancelled_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL,
                                     null=True, blank=True, related_name='cancelled_reservations')
    created_at = models.DateTimeField('创建时间', default=timezone.now)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 'reservations'
        verbose_name = '预约'
        verbose_name_plural = '预约'
        ordering = ['-start_time']
        indexes = [
            models.Index(fields=['user_id', 'status']),
            models.Index(fields=['instrument_id', 'status']),
            models.Index(fields=['start_time', 'end_time']),
        ]

    def __str__(self):
        return f'{self.instrument.name} - {self.user.real_name} ({self.start_time.strftime("%Y-%m-%d %H:%M")})'

    @property
    def status_text(self):
        return dict(self.STATUS_CHOICES).get(self.status, self.status)

    @property
    def duration_hours(self):
        return round((self.end_time - self.start_time).total_seconds() / 3600, 2)

    @property
    def can_cancel(self):
        if self.status not in ['pending', 'approved']:
            return False
        from django.conf import settings
        cancel_hours = settings.RESERVATION_SETTINGS['cancel_hours_before']
        hours_before = (self.start_time - timezone.now()).total_seconds() / 3600
        return hours_before >= cancel_hours

    @property
    def can_approve(self):
        return self.status == 'pending'

    @property
    def can_start(self):
        return self.status == 'approved' and timezone.now() >= self.start_time

    @property
    def can_complete(self):
        return self.status == 'in_progress'

    def clean(self):
        if self.end_time <= self.start_time:
            raise ValueError('结束时间必须大于开始时间')

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
