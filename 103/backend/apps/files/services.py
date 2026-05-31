"""
文件存储业务逻辑
"""
from .models import File, FileVersion, FileDownloadLog
from apps.audit.services import AuditLogService
from common.exceptions import NotFoundException, ValidationException
from common.utils.file_utils import (
    generate_storage_key, get_file_extension, get_mime_type, get_file_category
)
from django.conf import settings
from django.utils import timezone
from minio import Minio
from minio.error import S3Error
from urllib.parse import urlparse
import logging
import io

logger = logging.getLogger(__name__)


class MinIOService:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.client = None
            cls._instance._init_client()
        return cls._instance

    def _init_client(self):
        config = settings.MINIO_CONFIG
        try:
            self.client = Minio(
                endpoint=f"{config['endpoint']}:{config['port']}",
                access_key=config['access_key'],
                secret_key=config['secret_key'],
                secure=config['use_ssl']
            )
            self._ensure_bucket(config['default_bucket'])
        except Exception as e:
            logger.error(f'初始化 MinIO 客户端失败: {str(e)}')
            self.client = None

    def _ensure_bucket(self, bucket_name):
        if not self.client.bucket_exists(bucket_name):
            self.client.make_bucket(bucket_name)
            logger.info(f'创建存储桶: {bucket_name}')

    @property
    def bucket_name(self):
        return settings.MINIO_CONFIG['default_bucket']

    def is_available(self):
        return self.client is not None

    def bucket_exists(self):
        if not self.is_available():
            return False
        return self.client.bucket_exists(self.bucket_name)

    def create_bucket(self):
        if not self.is_available():
            raise ValidationException('存储服务不可用')
        self._ensure_bucket(self.bucket_name)

    def generate_presigned_upload_url(self, bucket_name, object_name, content_type):
        if not self.is_available():
            raise ValidationException('存储服务不可用')

        self._ensure_bucket(bucket_name)

        url = self.client.presigned_put_object(
            bucket_name=bucket_name,
            object_name=object_name,
            expires=settings.MINIO_CONFIG['presigned_url_expiry']
        )

        return {
            'upload_url': url,
            'download_url': self.generate_presigned_download_url(bucket_name, object_name),
            'bucket': bucket_name,
            'storage_key': object_name
        }

    def generate_presigned_download_url(self, bucket_name, object_name, filename=None):
        if not self.is_available():
            return None

        extra_params = {}
        if filename:
            extra_params['response-content-disposition'] = f'attachment; filename="{filename}"'

        try:
            url = self.client.presigned_get_object(
                bucket_name=bucket_name,
                object_name=object_name,
                expires=settings.MINIO_CONFIG['presigned_url_expiry'],
                response_headers=extra_params if extra_params else None
            )
            return url
        except Exception as e:
            logger.error(f'生成预签名下载URL失败: {str(e)}')
            return None

    def put_object(self, bucket_name, object_name, data, length, content_type):
        if not self.is_available():
            raise ValidationException('存储服务不可用')

        self._ensure_bucket(bucket_name)
        result = self.client.put_object(
            bucket_name=bucket_name,
            object_name=object_name,
            data=data,
            length=length,
            content_type=content_type
        )
        return result.etag

    def get_object(self, bucket_name, object_name):
        if not self.is_available():
            raise ValidationException('存储服务不可用')

        response = self.client.get_object(bucket_name, object_name)
        return response

    def delete_object(self, bucket_name, object_name):
        if not self.is_available():
            return False

        try:
            self.client.remove_object(bucket_name, object_name)
            return True
        except Exception as e:
            logger.error(f'删除对象失败: {str(e)}')
            return False

    def get_object_info(self, bucket_name, object_name):
        if not self.is_available():
            return None

        try:
            return self.client.stat_object(bucket_name, object_name)
        except Exception as e:
            logger.error(f'获取对象信息失败: {str(e)}')
            return None

    def list_objects(self, bucket_name, prefix='', recursive=True):
        if not self.is_available():
            return []

        try:
            return list(self.client.list_objects(bucket_name, prefix=prefix, recursive=recursive))
        except Exception as e:
            logger.error(f'列出对象失败: {str(e)}')
            return []


class FileService:
    @staticmethod
    def get_file_by_id(file_id):
        try:
            return File.objects.get(id=file_id)
        except File.DoesNotExist:
            raise NotFoundException(f'文件不存在: {file_id}')

    @staticmethod
    def create_upload_url(original_name, content_type=None, size=0,
                          instrument_id=None, use_record_id=None,
                          description='', tags='', user=None):
        minio = MinIOService()

        ext = get_file_extension(original_name)
        if not content_type:
            content_type = get_mime_type(ext)
        category = get_file_category(content_type)

        storage_key = generate_storage_key(original_name, subfolder=timezone.now().strftime('%Y/%m/%d'))
        bucket = settings.MINIO_CONFIG['default_bucket']

        upload_url = ''
        if minio.is_available():
            result = minio.generate_presigned_upload_url(bucket, storage_key, content_type)
            upload_url = result['upload_url']
        else:
            upload_url = f'/api/files/{bucket}/{storage_key}'

        file = File(
            name=original_name,
            original_name=original_name,
            mime_type=content_type,
            size=size,
            category=category,
            uploaded_by=user,
            instrument_id=instrument_id,
            use_record_id=use_record_id,
            storage_key=storage_key,
            bucket=bucket,
            description=description,
            tags=tags
        )
        file.save()

        AuditLogService.log(
            user=user,
            action='upload',
            module='files',
            resource_type='File',
            resource_id=str(file.id),
            detail=f'上传文件: {original_name}'
        )

        return {
            'file_id': str(file.id),
            'upload_url': upload_url,
            'storage_key': storage_key,
            'bucket': bucket
        }

    @staticmethod
    def confirm_upload(file_id, etag, size, user):
        file = FileService.get_file_by_id(file_id)

        if str(file.uploaded_by.id) != str(user.id) and not user.is_staff:
            raise ValidationException('只能确认自己上传的文件')

        minio = MinIOService()
        if minio.is_available():
            obj_info = minio.get_object_info(file.bucket, file.storage_key)
            if obj_info:
                file.etag = etag or obj_info.etag.replace('"', '')
                file.size = size or obj_info.size
            elif size > 0:
                file.etag = etag
                file.size = size
            else:
                raise ValidationException('文件不存在于存储中，请重新上传')
        else:
            if size > 0:
                file.etag = etag
                file.size = size

        file.save()

        FileVersion.objects.create(
            file=file,
            version=1,
            name=file.name,
            size=file.size,
            storage_key=file.storage_key,
            etag=file.etag,
            created_by=user
        )

        return file

    @staticmethod
    def update_file(file_id, data, user):
        file = FileService.get_file_by_id(file_id)

        if str(file.uploaded_by.id) != str(user.id) and not user.is_staff:
            raise ValidationException('只能修改自己的文件')

        for field in ['name', 'description', 'tags', 'instrument', 'use_record', 'is_public']:
            if field in data:
                setattr(file, field, data[field])

        file.save()
        return file

    @staticmethod
    def delete_file(file_id, user):
        file = FileService.get_file_by_id(file_id)

        if str(file.uploaded_by.id) != str(user.id) and not user.is_staff:
            raise ValidationException('只能删除自己的文件')

        minio = MinIOService()
        minio.delete_object(file.bucket, file.storage_key)

        FileVersion.objects.filter(file=file).delete()
        FileDownloadLog.objects.filter(file=file).delete()

        file.delete()

        AuditLogService.log(
            user=user,
            action='delete',
            module='files',
            resource_type='File',
            resource_id=str(file_id),
            detail=f'删除文件: {file.name}'
        )

    @staticmethod
    def get_download_url(file_id, user, request=None):
        file = FileService.get_file_by_id(file_id)

        minio = MinIOService()
        download_url = minio.generate_presigned_download_url(
            file.bucket,
            file.storage_key,
            filename=file.original_name
        )

        file.download_count += 1
        file.save()

        FileDownloadLog.objects.create(
            file=file,
            downloaded_by=user,
            ip_address=request.META.get('REMOTE_ADDR') if request else None,
            user_agent=request.META.get('HTTP_USER_AGENT') if request else None
        )

        AuditLogService.log(
            user=user,
            action='download',
            module='files',
            resource_type='File',
            resource_id=str(file.id),
            detail=f'下载文件: {file.name}'
        )

        return {
            'download_url': download_url,
            'filename': file.original_name,
            'mime_type': file.mime_type,
            'size': file.size
        }

    @staticmethod
    def get_preview_url(file_id, user):
        file = FileService.get_file_by_id(file_id)

        minio = MinIOService()
        preview_url = minio.generate_presigned_download_url(
            file.bucket,
            file.storage_key
        )

        return {
            'preview_url': preview_url,
            'filename': file.original_name,
            'mime_type': file.mime_type,
            'category': file.category,
            'can_preview': file.category in ['image', 'pdf', 'text']
        }

    @staticmethod
    def create_new_version(file_id, original_name, content_type, size, user, change_log=''):
        file = FileService.get_file_by_id(file_id)

        if str(file.uploaded_by.id) != str(user.id) and not user.is_staff:
            raise ValidationException('只能为自己的文件创建新版本')

        minio = MinIOService()

        ext = get_file_extension(original_name)
        if not content_type:
            content_type = get_mime_type(ext)

        new_version = file.current_version + 1
        storage_key = generate_storage_key(original_name, subfolder=f'versions/{file_id}/{new_version}')
        bucket = settings.MINIO_CONFIG['default_bucket']

        upload_url = ''
        if minio.is_available():
            result = minio.generate_presigned_upload_url(bucket, storage_key, content_type)
            upload_url = result['upload_url']
        else:
            upload_url = f'/api/files/{bucket}/{storage_key}'

        FileVersion.objects.create(
            file=file,
            version=new_version,
            name=original_name,
            size=size,
            storage_key=storage_key,
            created_by=user,
            change_log=change_log
        )

        file.current_version = new_version
        file.name = original_name
        file.original_name = original_name
        file.mime_type = content_type
        file.size = size
        file.storage_key = storage_key
        file.save()

        return {
            'version': new_version,
            'upload_url': upload_url,
            'storage_key': storage_key,
            'bucket': bucket
        }

    @staticmethod
    def get_user_files(user_id, category=None, instrument_id=None, use_record_id=None):
        files = File.objects.filter(uploaded_by_id=user_id)
        if category:
            files = files.filter(category=category)
        if instrument_id:
            files = files.filter(instrument_id=instrument_id)
        if use_record_id:
            files = files.filter(use_record_id=use_record_id)
        return files.order_by('-created_at')

    @staticmethod
    def get_file_versions(file_id):
        return FileVersion.objects.filter(file_id=file_id).order_by('-version')

    @staticmethod
    def get_dashboard_stats(user=None):
        base_query = File.objects.all()
        if user:
            base_query = base_query.filter(uploaded_by=user)

        total = base_query.count()
        images = base_query.filter(category='image').count()
        documents = base_query.filter(category='document').count()
        total_size = sum([f.size for f in base_query])

        return {
            'total': total,
            'images': images,
            'documents': documents,
            'total_size': total_size
        }

    @staticmethod
    def get_download_logs(file_id):
        return FileDownloadLog.objects.filter(file_id=file_id).order_by('-created_at')
