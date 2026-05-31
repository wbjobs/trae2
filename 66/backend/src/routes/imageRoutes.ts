import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import * as imageService from '../services/imageService';

const router = Router();

const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('只支持图片文件 (JPEG, PNG, GIF, WebP)'));
    }
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const result = imageService.getAllImages({
      resource_id: req.query.resource_id as string | undefined,
      page: parseInt(req.query.page as string) || 1,
      page_size: parseInt(req.query.page_size as string) || 20
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const image = imageService.getImageById(req.params.id);
    if (!image) {
      return res.status(404).json({ success: false, error: '影像不存在' });
    }
    res.json({ success: true, data: image });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/resource/:resourceId', async (req: Request, res: Response) => {
  try {
    const images = imageService.getImagesByResourceId(req.params.resourceId);
    res.json({ success: true, data: images });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post(
  '/upload',
  upload.array('images', 10),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({ success: false, error: '没有上传文件' });
      }

      const { resource_id, descriptions, taken_dates, locations, photographers } = req.body;

      if (!resource_id) {
        return res.status(400).json({ success: false, error: '缺少资源ID' });
      }

      const descArray = descriptions ? JSON.parse(descriptions) : [];
      const dateArray = taken_dates ? JSON.parse(taken_dates) : [];
      const locationArray = locations ? JSON.parse(locations) : [];
      const photographerArray = photographers ? JSON.parse(photographers) : [];

      const uploadedImages = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const image = imageService.createImage({
          resource_id,
          original_name: file.originalname,
          file_name: file.filename,
          file_path: file.path,
          file_size: file.size,
          mime_type: file.mimetype,
          description: descArray[i] || null,
          taken_date: dateArray[i] || null,
          location: locationArray[i] || null,
          photographer: photographerArray[i] || null
        });
        uploadedImages.push(image);
      }

      res.status(201).json({
        success: true,
        data: uploadedImages,
        message: `成功上传 ${uploadedImages.length} 张影像`
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const image = imageService.updateImage(req.params.id, req.body);

    if (!image) {
      return res.status(404).json({ success: false, error: '影像不存在' });
    }

    res.json({ success: true, data: image });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = imageService.deleteImage(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: '影像不存在' });
    }
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
