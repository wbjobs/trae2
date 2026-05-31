import { Request, Response, Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { DataStore } from '../../utils/dataStore';
import { ApiResponse, SpecimenFile } from '../../../shared/types';
import { AuthRequest, authenticateToken } from '../../common/middleware/auth';
import { generateId } from '../../utils/helpers';
import { config } from '../../config';

const router = Router();
const store = DataStore.getInstance();

const ensureUploadDir = (): void => {
  const uploadDir = path.resolve(config.uploadDir);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const thumbnailDir = path.resolve(config.uploadDir, 'thumbnails');
  if (!fs.existsSync(thumbnailDir)) {
    fs.mkdirSync(thumbnailDir, { recursive: true });
  }
};

ensureUploadDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.resolve(config.uploadDir));
  },
  filename: (_req, file, cb) => {
    const uniqueName = `${generateId()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: config.maxFileSize
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/bmp',
      'image/webp',
      'image/tiff',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'video/mp4',
      'video/quicktime'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型'));
    }
  }
});

const getFileType = (mimeType: string): SpecimenFile['fileType'] => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('application/pdf') || 
      mimeType.startsWith('application/msword') ||
      mimeType.startsWith('application/vnd') ||
      mimeType.startsWith('text/')) {
    return 'document';
  }
  return 'other';
};

router.post('/upload', authenticateToken, upload.single('file'), (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: '未接收到文件' });
      return;
    }

    const { specimenId } = req.body;

    if (!specimenId) {
      fs.unlinkSync(req.file.path);
      res.status(400).json({ success: false, message: '缺少标本ID参数' });
      return;
    }

    const specimen = store.specimens.get(specimenId);
    if (!specimen) {
      fs.unlinkSync(req.file.path);
      res.status(404).json({ success: false, message: '标本不存在' });
      return;
    }

    const fileId = generateId();
    const fileType = getFileType(req.file.mimetype);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const relativePath = path.relative(process.cwd(), req.file.path);
    const fileUrl = `${baseUrl}/files/preview/${path.basename(req.file.path)}`;

    const specimenFile: SpecimenFile = {
      id: fileId,
      specimenId,
      name: path.basename(req.file.filename),
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      fileType,
      storagePath: relativePath,
      url: fileUrl,
      thumbnailUrl: fileType === 'image' ? fileUrl : undefined,
      uploadedBy: req.userId!,
      createdAt: new Date()
    };

    store.specimenFiles.set(fileId, specimenFile);

    res.status(201).json({
      success: true,
      data: specimenFile,
      message: '文件上传成功'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '文件上传失败',
      errors: [error instanceof Error ? error.message : '未知错误']
    });
  }
});

router.post('/upload/multiple', authenticateToken, upload.array('files', 10), (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    if (!req.files || !Array.isArray(req.files)) {
      res.status(400).json({ success: false, message: '未接收到文件' });
      return;
    }

    const { specimenId } = req.body;

    if (!specimenId) {
      req.files.forEach(f => fs.unlinkSync(f.path));
      res.status(400).json({ success: false, message: '缺少标本ID参数' });
      return;
    }

    const specimen = store.specimens.get(specimenId);
    if (!specimen) {
      req.files.forEach(f => fs.unlinkSync(f.path));
      res.status(404).json({ success: false, message: '标本不存在' });
      return;
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const uploadedFiles: SpecimenFile[] = [];

    for (const file of req.files as Express.Multer.File[]) {
      const fileId = generateId();
      const fileType = getFileType(file.mimetype);
      const fileUrl = `${baseUrl}/files/preview/${path.basename(file.filename)}`;

      const specimenFile: SpecimenFile = {
        id: fileId,
        specimenId,
        name: path.basename(file.filename),
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        fileType,
        storagePath: path.relative(process.cwd(), file.path),
        url: fileUrl,
        thumbnailUrl: fileType === 'image' ? fileUrl : undefined,
        uploadedBy: req.userId!,
        createdAt: new Date()
      };

      store.specimenFiles.set(fileId, specimenFile);
      uploadedFiles.push(specimenFile);
    }

    res.status(201).json({
      success: true,
      data: uploadedFiles,
      message: `成功上传 ${uploadedFiles.length} 个文件`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '批量文件上传失败',
      errors: [error instanceof Error ? error.message : '未知错误']
    });
  }
});

router.get('/specimen/:specimenId', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const { specimenId } = req.params;

    const files = Array.from(store.specimenFiles.values())
      .filter(f => f.specimenId === specimenId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    res.json({
      success: true,
      data: files
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取文件列表失败' });
  }
});

router.get('/:id', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const file = store.specimenFiles.get(req.params.id);

    if (!file) {
      res.status(404).json({ success: false, message: '文件不存在' });
      return;
    }

    res.json({
      success: true,
      data: file
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取文件信息失败' });
  }
});

router.get('/preview/:filename', (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const filePath = path.resolve(config.uploadDir, filename);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, message: '文件不存在' });
      return;
    }

    const stat = fs.statSync(filePath);
    const fileExtension = path.extname(filename).toLowerCase();

    const mimeTypeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp',
      '.tiff': 'image/tiff',
      '.tif': 'image/tiff',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.txt': 'text/plain',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime'
    };

    const mimeType = mimeTypeMap[fileExtension] || 'application/octet-stream';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=31536000');

    const range = req.headers.range;
    if (range && mimeType.startsWith('video/')) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', chunkSize);

      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
    } else {
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    }
  } catch (error) {
    console.error('文件预览错误:', error);
    res.status(500).json({ success: false, message: '文件预览失败' });
  }
});

router.get('/download/:filename', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { filename } = req.params;
    const filePath = path.resolve(config.uploadDir, filename);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, message: '文件不存在' });
      return;
    }

    const file = Array.from(store.specimenFiles.values())
      .find(f => f.name === filename);

    res.download(filePath, file?.originalName || filename);
  } catch (error) {
    res.status(500).json({ success: false, message: '文件下载失败' });
  }
});

router.delete('/:id', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const file = store.specimenFiles.get(req.params.id);

    if (!file) {
      res.status(404).json({ success: false, message: '文件不存在' });
      return;
    }

    if (req.userRole !== 'admin' && file.uploadedBy !== req.userId) {
      res.status(403).json({ success: false, message: '无权删除此文件' });
      return;
    }

    const filePath = path.resolve(config.uploadDir, file.name);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    store.specimenFiles.delete(req.params.id);

    res.json({
      success: true,
      message: '文件删除成功'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除文件失败' });
  }
});

export default router;
