"""
文件工具函数
"""
import uuid
import hashlib
from django.utils.text import slugify


def generate_storage_key(original_name, subfolder=''):
    ext = original_name.rsplit('.', 1)[-1].lower() if '.' in original_name else ''
    new_uuid = uuid.uuid4().hex
    timestamp = uuid.uuid1().time
    if subfolder:
        return f'{subfolder}/{new_uuid}_{timestamp}.{ext}' if ext else f'{subfolder}/{new_uuid}_{timestamp}'
    return f'{new_uuid}_{timestamp}.{ext}' if ext else f'{new_uuid}_{timestamp}'


def get_file_extension(filename):
    return filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''


def get_mime_type(ext):
    mime_map = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'txt': 'text/plain',
        'csv': 'text/csv',
        'zip': 'application/zip',
        'rar': 'application/x-rar-compressed',
    }
    return mime_map.get(ext.lower(), 'application/octet-stream')


def format_file_size(size_bytes):
    if size_bytes < 1024:
        return f'{size_bytes} B'
    elif size_bytes < 1024 * 1024:
        return f'{size_bytes / 1024:.2f} KB'
    elif size_bytes < 1024 * 1024 * 1024:
        return f'{size_bytes / (1024 * 1024):.2f} MB'
    else:
        return f'{size_bytes / (1024 * 1024 * 1024):.2f} GB'


def get_file_category(mime_type):
    if mime_type.startswith('image/'):
        return 'image'
    elif mime_type.startswith('video/'):
        return 'video'
    elif mime_type.startswith('audio/'):
        return 'audio'
    elif 'pdf' in mime_type or 'document' in mime_type or 'spreadsheet' in mime_type or 'presentation' in mime_type:
        return 'document'
    elif 'text/' in mime_type:
        return 'text'
    return 'other'


def calculate_md5(file_content):
    md5 = hashlib.md5()
    md5.update(file_content)
    return md5.hexdigest()
