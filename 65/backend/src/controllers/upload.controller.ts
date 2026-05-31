import { Response } from 'express';
import { Op } from 'sequelize';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { SpecimenImage, ImageType } from '../models/SpecimenImage.model';
import { Specimen } from '../models/Specimen.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { storageService } from '../services/storage.service';
import { logger } from '../utils/logger';

const TEMP_DIR = path.join(process.cwd(), 'temp', 'chunks');

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

interface ChunkInfo {
  fileId: string;
  chunkIndex: number;
  totalChunks: number;
  fileName: string;
  fileSize: number;
  fileType: string;
}

const uploadSessions = new Map<string, {
  fileId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  totalChunks: number;
  uploadedChunks: Set<number>;
  createdAt: Date;
}>();

const getChunkPath = (fileId: string, chunkIndex: number) => {
  return path.join(TEMP_DIR, `${fileId}_${chunkIndex}`);
};

const cleanOldSessions = () => {
  const now = Date.now();
  const timeout = 24 * 60 * 60 * 1000;
  
  for (const [fileId, session] of uploadSessions.entries()) {
    if (now - session.createdAt.getTime() > timeout) {
      for (let i = 0; i < session.totalChunks; i++) {
        const chunkPath = getChunkPath(fileId, i);
        if (fs.existsSync(chunkPath)) {
          fs.unlinkSync(chunkPath);
        }
      }
      uploadSessions.delete(fileId);
    }
  }
};

setInterval(cleanOldSessions, 60 * 60 * 1000);

export const uploadController = {
  async initChunkUpload(req: AuthRequest, res: Response) {
    try {
      const { fileName, fileSize, fileType, md5 } = req.body;

      if (!fileName || !fileSize || !fileType) {
        return res.status(400).json({ error: '缺少必要参数' });
      }

      const fileId = md5 || crypto.createHash('md5').update(`${fileName}_${fileSize}_${Date.now()}`).digest('hex');

      const existingImage = await SpecimenImage.findOne({
        where: {
          fileName: {
            [Op.like]: `%${fileId}%`
          }
        }
      });

      if (existingImage) {
        return res.json({
          fileId,
          uploaded: true,
          image: existingImage,
          message: '文件已存在'
        });
      }

      const chunkSize = 5 * 1024 * 1024;
      const totalChunks = Math.ceil(fileSize / chunkSize);

      uploadSessions.set(fileId, {
        fileId,
        fileName,
        fileSize,
        fileType,
        totalChunks,
        uploadedChunks: new Set(),
        createdAt: new Date()
      });

      res.json({
        fileId,
        totalChunks,
        chunkSize,
        message: '分片上传初始化成功'
      });
    } catch (error) {
      logger.error('初始化分片上传失败:', error);
      res.status(500).json({ error: '初始化分片上传失败' });
    }
  },

  async uploadChunk(req: AuthRequest, res: Response) {
    try {
      const { fileId, chunkIndex } = req.body;

      if (!fileId || chunkIndex === undefined) {
        return res.status(400).json({ error: '缺少必要参数' });
      }

      const session = uploadSessions.get(fileId);
      if (!session) {
        return res.status(404).json({ error: '上传会话不存在或已过期' });
      }

      const file = (req as any).file;
      if (!file) {
        return res.status(400).json({ error: '没有收到分片数据' });
      }

      const chunkPath = getChunkPath(fileId, chunkIndex);
      fs.writeFileSync(chunkPath, file.buffer);

      session.uploadedChunks.add(Number(chunkIndex));

      res.json({
        fileId,
        chunkIndex: Number(chunkIndex),
        uploaded: session.uploadedChunks.size,
        total: session.totalChunks,
        message: '分片上传成功'
      });
    } catch (error) {
      logger.error('上传分片失败:', error);
      res.status(500).json({ error: '上传分片失败' });
    }
  },

  async checkChunk(req: AuthRequest, res: Response) {
    try {
      const { fileId, chunkIndex } = req.query;

      const session = uploadSessions.get(fileId as string);
      if (!session) {
        return res.json({ uploaded: false });
      }

      const chunkPath = getChunkPath(fileId as string, Number(chunkIndex));
      const exists = fs.existsSync(chunkPath) || session.uploadedChunks.has(Number(chunkIndex));

      res.json({ uploaded: exists });
    } catch (error) {
      logger.error('检查分片失败:', error);
      res.status(500).json({ error: '检查分片失败' });
    }
  },

  async completeChunkUpload(req: AuthRequest, res: Response) {
    try {
      const { fileId, specimenId, imageType, description, tags } = req.body;

      if (!fileId || !specimenId) {
        return res.status(400).json({ error: '缺少必要参数' });
      }

      const session = uploadSessions.get(fileId);
      if (!session) {
        return res.status(404).json({ error: '上传会话不存在或已过期' });
      }

      if (session.uploadedChunks.size !== session.totalChunks) {
        return res.status(400).json({ 
          error: '分片未全部上传完成',
          uploaded: session.uploadedChunks.size,
          total: session.totalChunks
        });
      }

      const specimen = await Specimen.findByPk(specimenId);
      if (!specimen) {
        return res.status(404).json({ error: '标本不存在' });
      }

      const mergedFilePath = path.join(TEMP_DIR, fileId);
      const writeStream = fs.createWriteStream(mergedFilePath);

      for (let i = 0; i < session.totalChunks; i++) {
        const chunkPath = getChunkPath(fileId, i);
        const chunkData = fs.readFileSync(chunkPath);
        writeStream.write(chunkData);
        fs.unlinkSync(chunkPath);
      }

      writeStream.end();

      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      const fileBuffer = fs.readFileSync(mergedFilePath);
      const ext = path.extname(session.fileName);
      const newFileName = `specimen/${specimenId}/${fileId}${ext}`;
      
      const fileUrl = await storageService.uploadFile(fileBuffer, newFileName, session.fileType);

      fs.unlinkSync(mergedFilePath);

      const existingImages = await SpecimenImage.count({ where: { specimenId: Number(specimenId) } });
      const isPrimary = existingImages === 0;

      const image = await SpecimenImage.create({
        specimenId: Number(specimenId),
        fileName: newFileName,
        originalName: session.fileName,
        fileUrl,
        fileSize: session.fileSize,
        fileType: session.fileType,
        imageType: imageType || ImageType.DETAIL,
        description: description || '',
        tags: tags || '',
        uploadedBy: req.user?.id,
        isPrimary,
        sortOrder: existingImages
      });

      uploadSessions.delete(fileId);

      res.json({
        image,
        message: '文件合并上传成功'
      });
    } catch (error) {
      logger.error('完成分片上传失败:', error);
      res.status(500).json({ error: '完成分片上传失败' });
    }
  },

  async abortChunkUpload(req: AuthRequest, res: Response) {
    try {
      const { fileId } = req.params;

      const session = uploadSessions.get(fileId);
      if (!session) {
        return res.status(404).json({ error: '上传会话不存在' });
      }

      for (let i = 0; i < session.totalChunks; i++) {
        const chunkPath = getChunkPath(fileId, i);
        if (fs.existsSync(chunkPath)) {
          fs.unlinkSync(chunkPath);
        }
      }

      uploadSessions.delete(fileId);

      res.json({ message: '上传已取消' });
    } catch (error) {
      logger.error('取消上传失败:', error);
      res.status(500).json({ error: '取消上传失败' });
    }
  },

  async updateImageTags(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { tags, description } = req.body;

      const image = await SpecimenImage.findByPk(id);
      if (!image) {
        return res.status(404).json({ error: '图片不存在' });
      }

      await image.update({
        tags: tags !== undefined ? tags : image.tags,
        description: description !== undefined ? description : image.description
      });

      res.json({
        image,
        message: '图片信息更新成功'
      });
    } catch (error) {
      logger.error('更新图片标签失败:', error);
      res.status(500).json({ error: '更新图片标签失败' });
    }
  }
};
