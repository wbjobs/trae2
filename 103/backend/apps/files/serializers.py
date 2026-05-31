"""
文件存储序列化器
"""
from rest_framework import serializers
from .models import File, FileVersion, FileDownloadLog
from apps.accounts.serializers import UserSimpleSerializer


class FileSimpleSerializer(serializers.ModelSerializer):
    size_formatted = serializers.CharField(read_only=True)
    category_text = serializers.CharField(read_only=True)
    uploaded_by_name = serializers.CharField(source='uploaded_by.real_name', read_only=True)
    instrument_name = serializers.CharField(source='instrument.name', read_only=True, default='')

    class Meta:
        model = File
        fields = [
            'id', 'name', 'original_name', 'size', 'size_formatted',
            'mime_type', 'category', 'category_text',
            'uploaded_by_name', 'instrument_name',
            'download_count', 'current_version', 'created_at'
        ]


class FileSerializer(serializers.ModelSerializer):
    size_formatted = serializers.CharField(read_only=True)
    category_text = serializers.CharField(read_only=True)
    extension = serializers.CharField(read_only=True)
    uploaded_by_name = serializers.CharField(source='uploaded_by.real_name', read_only=True)
    uploaded_by_avatar = serializers.CharField(source='uploaded_by.avatar', read_only=True, default='')
    instrument_name = serializers.CharField(source='instrument.name', read_only=True, default='')
    use_record_id = serializers.CharField(source='use_record.id', read_only=True, default='')
    versions = serializers.SerializerMethodField()

    class Meta:
        model = File
        fields = [
            'id', 'name', 'original_name', 'size', 'size_formatted',
            'mime_type', 'category', 'category_text', 'extension',
            'uploaded_by', 'uploaded_by_name', 'uploaded_by_avatar',
            'instrument', 'instrument_name', 'use_record', 'use_record_id',
            'storage_key', 'bucket', 'etag', 'current_version',
            'description', 'tags', 'is_public', 'download_count',
            'versions', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at', 'download_count', 'etag', 'storage_key', 'bucket']

    def get_versions(self, obj):
        versions = obj.versions.all()[:5]
        return FileVersionSerializer(versions, many=True).data


class FileCreateSerializer(serializers.Serializer):
    original_name = serializers.CharField(required=True, max_length=255)
    content_type = serializers.CharField(required=False, default='application/octet-stream')
    size = serializers.IntegerField(required=False, default=0)
    instrument_id = serializers.UUIDField(required=False, allow_null=True)
    use_record_id = serializers.UUIDField(required=False, allow_null=True)
    description = serializers.CharField(required=False, allow_blank=True, default='')
    tags = serializers.CharField(required=False, allow_blank=True, default='')


class FileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = File
        fields = ['name', 'description', 'tags', 'instrument', 'use_record', 'is_public']


class FileVersionSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.real_name', read_only=True, default='')

    class Meta:
        model = FileVersion
        fields = [
            'id', 'version', 'name', 'size', 'storage_key',
            'etag', 'created_by', 'created_by_name', 'change_log', 'created_at'
        ]


class FileDownloadLogSerializer(serializers.ModelSerializer):
    downloaded_by_name = serializers.CharField(source='downloaded_by.real_name', read_only=True, default='')

    class Meta:
        model = FileDownloadLog
        fields = [
            'id', 'file', 'downloaded_by', 'downloaded_by_name',
            'ip_address', 'created_at'
        ]


class FileUploadConfirmSerializer(serializers.Serializer):
    file_id = serializers.UUIDField(required=True)
    etag = serializers.CharField(required=False, allow_blank=True)
    size = serializers.IntegerField(required=False, default=0)


class FileNewVersionSerializer(serializers.Serializer):
    original_name = serializers.CharField(required=True, max_length=255)
    content_type = serializers.CharField(required=False, default='application/octet-stream')
    size = serializers.IntegerField(required=False, default=0)
    change_log = serializers.CharField(required=False, allow_blank=True, default='')


class FileStatsSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    images = serializers.IntegerField()
    documents = serializers.IntegerField()
    total_size = serializers.IntegerField()
