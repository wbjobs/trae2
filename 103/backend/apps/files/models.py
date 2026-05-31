"""
文件存储数据模型
"""
import uuid
from django.db import models
from django.utils import timezone


class File(models.Model):
    CATEGORY_CHOICES = (
        ('image', '图片'),
        ('document', '文档'),
        ('video', '视频'),
        ('audio', '音频'),
        ('archive', '压缩包'),
        ('other', '其他'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField('文件名称', max_length=255)
    original_name = models.CharField('原始文件名', max_length=255)
    mime_type = models.CharField('MIME类型', max_length=100, default='application/octet-stream')
    size = models.BigIntegerField('文件大小(字节)', default=0)
    category = models.CharField('文件分类', max_length=20, choices=CATEGORY_CHOICES, default='other')
    uploaded_by = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='uploaded_files')
    instrument = models.ForeignKey('instruments.Instrument', on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name='files')
    use_record = models.ForeignKey('records.UseRecord', on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name='files')
    storage_key = models.CharField('存储键', max_length=500)
    bucket = models.CharField('存储桶', max_length=100)
    etag = models.CharField('ETag', max_length=100, blank=True)
    current_version = models.IntegerField('当前版本', default=1)
    description = models.TextField('描述', blank=True)
    tags = models.CharField('标签', max_length=500, blank=True)
    is_public = models.BooleanField('是否公开', default=False)
    download_count = models.IntegerField('下载次数', default=0)
    created_at = models.DateTimeField('创建时间', default=timezone.now)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        db_table = 'files'
        verbose_name = '文件'
        verbose_name_plural = '文件'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['uploaded_by']),
            models.Index(fields=['instrument']),
            models.Index(fields=['use_record']),
            models.Index(fields=['category']),
            models.Index(fields=['storage_key']),
        ]

    def __str__(self):
        return self.name

    @property
    def size_formatted(self):
        from common.utils.file_utils import format_file_size
        return format_file_size(self.size)

    @property
    def category_text(self):
        return dict(self.CATEGORY_CHOICES).get(self.category, self.category)

    @property
    def extension(self):
        return self.original_name.rsplit('.', 1)[-1].lower() if '.' in self.original_name else ''


class FileVersion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file = models.ForeignKey(File, on_delete=models.CASCADE, related_name='versions')
    version = models.IntegerField('版本号')
    name = models.CharField('文件名称', max_length=255)
    size = models.BigIntegerField('文件大小(字节)', default=0)
    storage_key = models.CharField('存储键', max_length=500)
    etag = models.CharField('ETag', max_length=100, blank=True)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True)
    change_log = models.TextField('变更说明', blank=True)
    created_at = models.DateTimeField('创建时间', default=timezone.now)

    class Meta:
        db_table = 'file_versions'
        verbose_name = '文件版本'
        verbose_name_plural = '文件版本'
        ordering = ['-version']
        unique_together = ('file', 'version')

    def __str__(self):
        return f'{self.file.name} v{self.version}'


class FileDownloadLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file = models.ForeignKey(File, on_delete=models.CASCADE, related_name='download_logs')
    downloaded_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True)
    ip_address = models.CharField('IP地址', max_length=50, blank=True)
    user_agent = models.TextField('User Agent', blank=True)
    created_at = models.DateTimeField('下载时间', default=timezone.now)

    class Meta:
        db_table = 'file_download_logs'
        verbose_name = '文件下载日志'
        verbose_name_plural = '文件下载日志'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.file.name} - {self.created_at}'
