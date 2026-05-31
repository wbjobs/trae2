import { Request, Response, Router } from 'express';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { DataStore } from '../../utils/dataStore';
import { ApiResponse, ChunkUploadSession, SpecimenFile } from '../../../shared/types';
import { AuthRequest, authenticateToken } from '../../common/middleware/auth';
import { generateId } from '../../utils/helpers';
import { config } from '../../config';

const router = Router();
const store = DataStore.getInstance();

const CHUNK_SIZE = 5 * 1024 * 1024;

const initUploadSchema = z.object({
  fileName: z.string().min(1, '文件名不能为空'),
  fileSize: z.number().min(1, '文件大小必须大于0'),
  specimenId: z.string().min(1, '标本ID不能为空'),
  mimeType: z.string().optional()
});

const uploadChunkSchema = z.object({
  sessionId: z.string().min(1, '会话ID不能为空'),
  chunkIndex: z.number().min(0, '分块索引必须大于等于0'),
  chunkData: z.any()
});

router.post('/init', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const validated = initUploadSchema.parse(req.body);
    const now = new Date();

    const specimen = store.specimens.get(validated.specimenId);
    if (!specimen) {
      res.status(404).json({ success: false, message: '标本不存在' });
      return;
    }

    const chunkSize = CHUNK_SIZE;
    const totalChunks = Math.ceil(validated.fileSize / chunkSize);
    const sessionId = generateId();

    const session: ChunkUploadSession = {
      sessionId,
      fileName: validated.fileName,
      fileSize: validated.fileSize,
      chunkSize,
      totalChunks,
      uploadedChunks: [],
      specimenId: validated.specimenId,
      createdBy: req.userId!,
      createdAt: now
    };

    store.chunkUploadSessions.set(sessionId, session);

    const chunkDir = path.resolve(config.uploadDir, 'chunks', sessionId);
    if (!fs.existsSync(chunkDir)) {
      fs.mkdirSync(chunkDir, { recursive: true });
    }

    res.json({
      success: true,
      data: {
        sessionId,
        chunkSize,
        totalChunks
      },
      message: '上传会话初始化成功'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        message: '数据验证失败',
        errors: error.errors.map(e => e.message)
      });
      return;
    }
    res.status(500).json({ success: false, message: '初始化上传失败' });
  }
});

router.post('/chunk', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const { sessionId, chunkIndex } = req.body;
    const session = store.chunkUploadSessions.get(sessionId);

    if (!session) {
      res.status(404).json({ success: false, message: '上传会话不存在' });
      return;
    }

    if (session.createdBy !== req.userId) {
      res.status(403).json({ success: false, message: '无权操作此上传会话' });
      return;
    }

    if (session.uploadedChunks.includes(chunkIndex)) {
      res.json({
        success: true,
        data: {
          uploadedChunks: session.uploadedChunks,
          progress: Math.round((session.uploadedChunks.length / session.totalChunks) * 100)
        },
        message: '分块已上传'
      });
      return;
    }

    const chunkDir = path.resolve(config.uploadDir, 'chunks', sessionId);
    const chunkPath = path.join(chunkDir, `chunk-${chunkIndex}`);

    if (req.body.chunkData) {
      const buffer = Buffer.from(req.body.chunkData, 'base64');
      fs.writeFileSync(chunkPath, buffer);
    }

    session.uploadedChunks.push(chunkIndex);
    session.uploadedChunks.sort((a, b) => a - b);

    res.json({
      success: true,
      data: {
        uploadedChunks: session.uploadedChunks,
        progress: Math.round((session.uploadedChunks.length / session.totalChunks) * 100),
        isComplete: session.uploadedChunks.length === session.totalChunks
      },
      message: '分块上传成功'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '分块上传失败' });
  }
});

router.post('/complete', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const { sessionId } = req.body;
    const session = store.chunkUploadSessions.get(sessionId);

    if (!session) {
      res.status(404).json({ success: false, message: '上传会话不存在' });
      return;
    }

    if (session.createdBy !== req.userId) {
      res.status(403).json({ success: false, message: '无权操作此上传会话' });
      return;
    }

    if (session.uploadedChunks.length !== session.totalChunks) {
      res.status(400).json({
        success: false,
        message: `上传未完成，已上传 ${session.uploadedChunks.length}/${session.totalChunks} 分块`
      });
      return;
    }

    const chunkDir = path.resolve(config.uploadDir, 'chunks', sessionId);
    const finalFileName = `${generateId()}-${Date.now()}${path.extname(session.fileName)}`;
    const finalFilePath = path.resolve(config.uploadDir, finalFileName);

    const writeStream = fs.createWriteStream(finalFilePath);

    for (let i = 0; i < session.totalChunks; i++) {
      const chunkPath = path.join(chunkDir, `chunk-${i}`);
      if (fs.existsSync(chunkPath)) {
        const chunkData = fs.readFileSync(chunkPath);
        writeStream.write(chunkData);
      }
    }

    writeStream.end();

    writeStream.on('finish', () => {
      const fileType = getFileType(session.fileName);
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const fileUrl = `${baseUrl}/files/preview/${finalFileName}`;

      const fileId = generateId();
      const specimenFile: SpecimenFile = {
        id: fileId,
        specimenId: session.specimenId,
        name: finalFileName,
        originalName: session.fileName,
        mimeType: getMimeType(session.fileName),
        size: session.fileSize,
        fileType,
        storagePath: path.relative(process.cwd(), finalFilePath),
        url: fileUrl,
        thumbnailUrl: fileType === 'image' ? fileUrl : undefined,
        uploadedBy: req.userId!,
        createdAt: new Date()
      };

      store.specimenFiles.set(fileId, specimenFile);

      fs.rmdirSync(chunkDir, { recursive: true });
      store.chunkUploadSessions.delete(sessionId);

      res.json({
        success: true,
        data: specimenFile,
        message: '文件合并完成'
      });
    });

    writeStream.on('error', (err) => {
      res.status(500).json({ success: false, message: '文件合并失败' });
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '完成上传失败' });
  }
});

router.get('/status/:sessionId', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const session = store.chunkUploadSessions.get(req.params.sessionId);

    if (!session) {
      res.status(404).json({ success: false, message: '上传会话不存在' });
      return;
    }

    res.json({
      success: true,
      data: {
        sessionId: session.sessionId,
        fileName: session.fileName,
        fileSize: session.fileSize,
        totalChunks: session.totalChunks,
        uploadedChunks: session.uploadedChunks,
        progress: Math.round((session.uploadedChunks.length / session.totalChunks) * 100),
        isComplete: session.uploadedChunks.length === session.totalChunks
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取上传状态失败' });
  }
});

router.delete('/:sessionId', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const session = store.chunkUploadSessions.get(req.params.sessionId);

    if (!session) {
      res.status(404).json({ success: false, message: '上传会话不存在' });
      return;
    }

    if (session.createdBy !== req.userId && req.userRole !== 'admin') {
      res.status(403).json({ success: false, message: '无权操作此上传会话' });
      return;
    }

    const chunkDir = path.resolve(config.uploadDir, 'chunks', req.params.sessionId);
    if (fs.existsSync(chunkDir)) {
      fs.rmdirSync(chunkDir, { recursive: true });
    }

    store.chunkUploadSessions.delete(req.params.sessionId);

    res.json({ success: true, message: '上传会话已取消' });
  } catch (error) {
    res.status(500).json({ success: false, message: '取消上传失败' });
  }
});

function getFileType(fileName: string): SpecimenFile['fileType'] {
  const ext = path.extname(fileName).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif'].includes(ext)) return 'image';
  if (['.mp4', '.mov', '.avi', '.wmv', '.mkv'].includes(ext)) return 'video';
  if (['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv'].includes(ext)) return 'document';
  return 'other';
}

function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp',
    '.tiff': 'image/tiff',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.txt': 'text/plain',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime'
  };
  return mimeTypeMap[ext] || 'application/octet-stream';
}

export default router;
