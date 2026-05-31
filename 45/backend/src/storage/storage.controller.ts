import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import minioService from './minio.service';
import ChunkUpload from './upload.model';
import { AuthRequest } from '../auth/auth.middleware';
import { AppError } from '../middleware/error.middleware';

const CHUNK_SIZE = 5 * 1024 * 1024;
const CHUNK_DIR = path.join(__dirname, '../../public/chunks');

if (!fs.existsSync(CHUNK_DIR)) {
  fs.mkdirSync(CHUNK_DIR, { recursive: true });
}

const storage = multer.memoryStorage();
export const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024,
    fieldSize: 500 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'model/gltf-binary',
      'model/gltf+json',
      'application/octet-stream',
      'application/x-ply',
      'application/x-3ds',
      'application/x-obj',
      'application/x-stl',
      'application/octet-stream',
      'multipart/form-data'
    ];
    const allowedExtensions = ['.glb', '.gltf', '.ply', '.obj', '.3ds', '.stl', '.fbx', '.zip', '.rar'];
    const fileExt = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件格式，请上传 .glb, .gltf, .ply, .obj, .3ds, .stl, .fbx 格式文件') as any, false);
    }
  }
});

export const uploadModel = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const timeoutId = setTimeout(() => {
    if (!res.headersSent) {
      next(new AppError('上传超时，请检查网络或上传较小的文件', 408));
    }
  }, 600000);

  try {
    if (!req.file) {
      clearTimeout(timeoutId);
      return next(new AppError('请选择要上传的文件', 400));
    }

    if (req.file.size > 500 * 1024 * 1024) {
      clearTimeout(timeoutId);
      return next(new AppError('文件大小超过限制（最大500MB）', 413));
    }

    const fileId = randomUUID();
    const fileExt = req.file.originalname.substring(req.file.originalname.lastIndexOf('.'));
    const storageId = `${fileId}${fileExt}`;

    let fileUrl: string;
    try {
      fileUrl = await minioService.uploadFile(
        storageId,
        req.file.buffer,
        req.file.size,
        req.file.mimetype
      );
    } catch (minioErr) {
      console.warn('MinIO上传失败，使用本地存储:', minioErr);
      fileUrl = `/api/storage/file/${storageId}`;
      const fs = require('fs');
      const path = require('path');
      const uploadDir = path.join(__dirname, '../../public/uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      fs.writeFileSync(path.join(uploadDir, storageId), req.file.buffer);
    }

    clearTimeout(timeoutId);
    res.status(201).json({
      status: 'success',
      data: {
        fileId: storageId,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        fileType: req.file.mimetype,
        url: fileUrl,
        uploadDate: new Date()
      }
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if ((err as any).code === 'LIMIT_FILE_SIZE') {
      return next(new AppError('文件大小超过限制（最大500MB）', 413));
    }
    next(new AppError((err as Error).message || '上传失败', 500));
  }
};

export const getModelFile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { fileId } = req.params;
    
    let fileStream;
    try {
      fileStream = await minioService.getFileStream(fileId);
    } catch (minioErr) {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(__dirname, '../../public/uploads', fileId);
      if (fs.existsSync(filePath)) {
        fileStream = fs.createReadStream(filePath);
      } else {
        return next(new AppError('文件不存在', 404));
      }
    }

    fileStream.pipe(res);
  } catch (err) {
    next(new AppError('获取文件失败', 500));
  }
};

export const getModelUrl = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { fileId } = req.params;
    
    let url: string;
    try {
      url = await minioService.getFileUrl(fileId);
    } catch (minioErr) {
      url = `/uploads/${fileId}`;
    }

    res.status(200).json({
      status: 'success',
      data: {
        fileId,
        url
      }
    });
  } catch (err) {
    next(new AppError('获取文件URL失败', 500));
  }
};

export const deleteModel = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { fileId } = req.params;
    
    try {
      await minioService.deleteFile(fileId);
    } catch (minioErr) {
      const filePath = path.join(__dirname, '../../public/uploads', fileId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (err) {
    next(new AppError('删除文件失败', 500));
  }
};

export const initChunkUpload = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(new AppError('请先登录', 401));
  }

  const { fileName, fileSize, fileType } = req.body;

  if (!fileName || !fileSize) {
    return next(new AppError('请提供文件名和文件大小', 400));
  }

  const chunkSize = CHUNK_SIZE;
  const totalChunks = Math.ceil(fileSize / chunkSize);
  const uploadId = randomUUID();

  const uploadDir = path.join(CHUNK_DIR, uploadId);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  const chunkUpload = await ChunkUpload.create({
    uploadId,
    fileName,
    fileSize,
    chunkSize,
    totalChunks,
    fileType,
    uploadedBy: req.user._id,
    status: 'pending',
    expiresAt
  });

  res.status(201).json({
    status: 'success',
    data: {
      uploadId,
      chunkSize,
      totalChunks,
      uploadedChunks: []
    }
  });
};

export const uploadChunk = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(new AppError('请先登录', 401));
  }

  const { uploadId, chunkIndex } = req.body;

  if (!uploadId || chunkIndex === undefined) {
    return next(new AppError('缺少必要参数', 400));
  }

  if (!req.file) {
    return next(new AppError('请上传分片文件', 400));
  }

  const chunkUpload = await ChunkUpload.findOne({ uploadId });
  if (!chunkUpload) {
    return next(new AppError('上传任务不存在或已过期', 404));
  }

  if (chunkUpload.uploadedBy.toString() !== req.user._id.toString()) {
    return next(new AppError('无权操作此上传任务', 403));
  }

  const chunkIndexNum = parseInt(chunkIndex, 10);
  if (chunkIndexNum < 0 || chunkIndexNum >= chunkUpload.totalChunks) {
    return next(new AppError('分片索引无效', 400));
  }

  const chunkPath = path.join(CHUNK_DIR, uploadId, `chunk-${chunkIndexNum}`);
  fs.writeFileSync(chunkPath, req.file.buffer);

  if (!chunkUpload.uploadedChunks.includes(chunkIndexNum)) {
    chunkUpload.uploadedChunks.push(chunkIndexNum);
  }
  chunkUpload.status = 'uploading';
  await chunkUpload.save();

  const progress = Math.round((chunkUpload.uploadedChunks.length / chunkUpload.totalChunks) * 100);

  res.status(200).json({
    status: 'success',
    data: {
      uploadId,
      chunkIndex: chunkIndexNum,
      uploadedChunks: chunkUpload.uploadedChunks,
      progress
    }
  });
};

export const getChunkUploadStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const { uploadId } = req.params;

  const chunkUpload = await ChunkUpload.findOne({ uploadId });
  if (!chunkUpload) {
    return next(new AppError('上传任务不存在或已过期', 404));
  }

  const progress = Math.round((chunkUpload.uploadedChunks.length / chunkUpload.totalChunks) * 100);

  res.status(200).json({
    status: 'success',
    data: {
      uploadId,
      totalChunks: chunkUpload.totalChunks,
      uploadedChunks: chunkUpload.uploadedChunks,
      progress,
      status: chunkUpload.status
    }
  });
};

export const completeChunkUpload = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(new AppError('请先登录', 401));
  }

  const { uploadId } = req.params;

  const chunkUpload = await ChunkUpload.findOne({ uploadId });
  if (!chunkUpload) {
    return next(new AppError('上传任务不存在或已过期', 404));
  }

  if (chunkUpload.uploadedBy.toString() !== req.user._id.toString()) {
    return next(new AppError('无权操作此上传任务', 403));
  }

  if (chunkUpload.uploadedChunks.length !== chunkUpload.totalChunks) {
    return next(new AppError('分片上传未完成', 400));
  }

  try {
    const fileExt = path.extname(chunkUpload.fileName);
    const storageId = `${uploadId}${fileExt}`;
    const finalFilePath = path.join(__dirname, '../../public/uploads', storageId);

    const writeStream = fs.createWriteStream(finalFilePath);

    for (let i = 0; i < chunkUpload.totalChunks; i++) {
      const chunkPath = path.join(CHUNK_DIR, uploadId, `chunk-${i}`);
      const chunkBuffer = fs.readFileSync(chunkPath);
      writeStream.write(chunkBuffer);
    }

    writeStream.end();

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', () => resolve());
      writeStream.on('error', reject);
    });

    let fileUrl = `/api/storage/file/${storageId}`;

    try {
      const fileBuffer = fs.readFileSync(finalFilePath);
      fileUrl = await minioService.uploadFile(
        storageId,
        fileBuffer,
        chunkUpload.fileSize,
        chunkUpload.fileType
      );
    } catch (minioErr) {
      console.warn('MinIO上传失败，使用本地存储:', minioErr);
    }

    chunkUpload.status = 'completed';
    await chunkUpload.save();

    fs.rmSync(path.join(CHUNK_DIR, uploadId), { recursive: true, force: true });

    res.status(200).json({
      status: 'success',
      data: {
        fileId: storageId,
        fileName: chunkUpload.fileName,
        fileSize: chunkUpload.fileSize,
        fileType: chunkUpload.fileType,
        url: fileUrl,
        uploadDate: new Date()
      }
    });
  } catch (err) {
    chunkUpload.status = 'failed';
    await chunkUpload.save();
    next(new AppError('合并分片失败: ' + (err as Error).message, 500));
  }
};

export const cancelChunkUpload = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(new AppError('请先登录', 401));
  }

  const { uploadId } = req.params;

  const chunkUpload = await ChunkUpload.findOne({ uploadId });
  if (!chunkUpload) {
    return next(new AppError('上传任务不存在或已过期', 404));
  }

  if (chunkUpload.uploadedBy.toString() !== req.user._id.toString()) {
    return next(new AppError('无权操作此上传任务', 403));
  }

  const chunkDir = path.join(CHUNK_DIR, uploadId);
  if (fs.existsSync(chunkDir)) {
    fs.rmSync(chunkDir, { recursive: true, force: true });
  }

  await ChunkUpload.deleteOne({ uploadId });

  res.status(200).json({
    status: 'success',
    message: '上传已取消'
  });
};
