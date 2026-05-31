"""
仪器管理数据模型
"""
import uuid
from django.db import models
from django.utils import timezone


class InstrumentCategory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField('分类名称', max_length=50)
    code = models.CharField('分类编码', max_length=50, unique=True)
    description = models.TextField('描述', blank=True)
    created_at = models.DateTimeField('创建时间', default=timezone.now)

    class Meta:
        db_table = 'instrument_categories'
        verbose_name = '仪器分类'
        verbose_name_plural = '仪器分类'

    def __str__(self):
        return self.name


class Instrument(models.Model):
    STATUS_CHOICES = (
        ('available', '可用'),
        ('in_use', '使用中'),
        ('maintenance', '维护中'),
        ('unavailable', '不可用'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField('仪器名称', max_length=100)
    code = models.CharField('仪器编号', max_length=50, unique=True)
    model = models.CharField('型号', max_length=100, blank=True)
    manufacturer = models.CharField('生产厂商', max_length=100, blank=True)
    location = models.CharField('放置位置', max_length=100, blank=True)
    category = models.ForeignKey(InstrumentCategory, on_delete=models.SET_NULL,
                                 null=True, blank=True, related_name='instruments')
    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='available')
    description = models.TextField('描述', blank=True)
    specifications = models.TextField('技术规格', blank=True)
    image = models.CharField('仪器图片', max_length=255, blank=True)
    requires_approval = models.BooleanField('需要审批', default=False)
    daily_max_hours = models.IntegerField('每日最长使用时长(小时)', default=8)
    reservation_lead_days = models.IntegerField('可提前预约天数', default=14)
    min_reservation_hours = models.FloatField('最小预约时长(小时)', default=0.5)
    max_reservation_hours = models.FloatField('最大预约时长(小时)', default=8)
    created_at = models.DateTimeField('创建时间', default=timezone.now)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 'instruments'
        verbose_name = '仪器'
        verbose_name_plural = '仪器'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} ({self.code})'

    @property
    def status_text(self):
        return dict(self.STATUS_CHOICES).get(self.status, self.status)

    @property
    def is_available(self):
        return self.status == 'available'


class InstrumentMaintenance(models.Model):
    MAINTENANCE_TYPE_CHOICES = (
        ('routine', '例行维护'),
        ('repair', '故障维修'),
        ('calibration', '校准'),
        ('upgrade', '升级'),
    )

    STATUS_CHOICES = (
        ('pending', '待处理'),
        ('in_progress', '进行中'),
        ('completed', '已完成'),
        ('cancelled', '已取消'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    instrument = models.ForeignKey(Instrument, on_delete=models.CASCADE, related_name='maintenances')
    type = models.CharField('维护类型', max_length=20, choices=MAINTENANCE_TYPE_CHOICES)
    title = models.CharField('标题', max_length=200)
    description = models.TextField('描述', blank=True)
    scheduled_date = models.DateField('计划日期')
    actual_date = models.DateField('实际日期', null=True, blank=True)
    operator = models.CharField('操作人员', max_length=50, blank=True)
    cost = models.DecimalField('费用', max_digits=10, decimal_places=2, default=0)
    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='pending')
    remarks = models.TextField('备注', blank=True)
    created_at = models.DateTimeField('创建时间', default=timezone.now)

    class Meta:
        db_table = 'instrument_maintenances'
        verbose_name = '仪器维护'
        verbose_name_plural = '仪器维护'
        ordering = ['-scheduled_date']

    def __str__(self):
        return f'{self.instrument.name} - {self.title}'
