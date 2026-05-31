import path from 'path';
import crypto from 'crypto';

export const generateFileName = (originalName: string, prefix: string = ''): string => {
  const ext = path.extname(originalName);
  const hash = crypto.createHash('md5').update(Date.now().toString() + originalName).digest('hex');
  const timestamp = Date.now();
  return `${prefix}${timestamp}_${hash}${ext}`;
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const isImageFile = (mimeType: string): boolean => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/tiff', 'image/bmp'];
  return allowedTypes.includes(mimeType);
};

export const getImageInfo = (mimeType: string): { format: string; type: string } => {
  const typeMap: Record<string, { format: string; type: string }> = {
    'image/jpeg': { format: 'JPEG', type: '压缩图片' },
    'image/png': { format: 'PNG', type: '无损图片' },
    'image/gif': { format: 'GIF', type: '动图' },
    'image/webp': { format: 'WebP', type: '现代图片格式' },
    'image/tiff': { format: 'TIFF', type: '高清图片' },
    'image/bmp': { format: 'BMP', type: '位图' }
  };
  return typeMap[mimeType] || { format: 'UNKNOWN', type: '未知格式' };
};
