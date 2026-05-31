import { Response } from 'express';
import multer from 'multer';
import { SpecimenImage, ImageType } from '../models/SpecimenImage.model';
import { Specimen } from '../models/Specimen.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { storageService } from '../services/storage.service';
import { generateFileName, isImageFile } from '../utils/fileUtils';
import { logger } from '../utils/logger';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024,
    fieldSize: 500 * 1024 * 1024
  }
});

export const imageController = {
  uploadMiddleware: upload.array('images', 10),

  async uploadImages(req: AuthRequest, res: Response) {
    try {
      const { specimenId, imageType = ImageType.DETAIL } = req.body;

      if (!specimenId) {
        return res.status(400).json({ error: '缺少标本ID' });
      }

      const specimen = await Specimen.findByPk(specimenId);
      if (!specimen) {
        return res.status(404).json({ error: '标本不存在' });
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: '没有上传文件' });
      }

      const uploadedImages = [];

      for (const file of files) {
        if (!isImageFile(file.mimetype)) {
          continue;
        }

        const fileName = generateFileName(file.originalname, 'specimen/');
        const fileUrl = await storageService.uploadFile(file.buffer, fileName, file.mimetype);

        const existingImages = await SpecimenImage.count({ where: { specimenId: Number(specimenId) } });
        const isPrimary = existingImages === 0;

        const image = await SpecimenImage.create({
          specimenId: Number(specimenId),
          fileName,
          originalName: file.originalname,
          fileUrl,
          fileSize: file.size,
          fileType: file.mimetype,
          imageType,
          uploadedBy: req.user?.id,
          isPrimary,
          sortOrder: existingImages
        });

        uploadedImages.push(image);
      }

      res.status(201).json({
        images: uploadedImages,
        message: `成功上传 ${uploadedImages.length} 张图片`
      });
    } catch (error) {
      logger.error('上传图片失败:', error);
      res.status(500).json({ error: '上传图片失败' });
    }
  },

  async getImagesBySpecimenId(req: AuthRequest, res: Response) {
    try {
      const { specimenId } = req.params;

      const images = await SpecimenImage.findAll({
        where: { specimenId: Number(specimenId) },
        order: [['sortOrder', 'ASC'], ['createdAt', 'DESC']]
      });

      res.json({ images });
    } catch (error) {
      logger.error('获取图片列表失败:', error);
      res.status(500).json({ error: '获取图片列表失败' });
    }
  },

  async getImageById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const image = await SpecimenImage.findByPk(id);
      if (!image) {
        return res.status(404).json({ error: '图片不存在' });
      }

      res.json({ image });
    } catch (error) {
      logger.error('获取图片详情失败:', error);
      res.status(500).json({ error: '获取图片详情失败' });
    }
  },

  async setPrimaryImage(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const image = await SpecimenImage.findByPk(id);
      if (!image) {
        return res.status(404).json({ error: '图片不存在' });
      }

      await SpecimenImage.update(
        { isPrimary: false },
        { where: { specimenId: image.specimenId } }
      );

      await image.update({ isPrimary: true });

      res.json({
        image,
        message: '已设置为主图'
      });
    } catch (error) {
      logger.error('设置主图失败:', error);
      res.status(500).json({ error: '设置主图失败' });
    }
  },

  async updateImage(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { description, imageType, sortOrder } = req.body;

      const image = await SpecimenImage.findByPk(id);
      if (!image) {
        return res.status(404).json({ error: '图片不存在' });
      }

      await image.update({ description, imageType, sortOrder });

      res.json({
        image,
        message: '图片信息更新成功'
      });
    } catch (error) {
      logger.error('更新图片信息失败:', error);
      res.status(500).json({ error: '更新图片信息失败' });
    }
  },

  async deleteImage(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const image = await SpecimenImage.findByPk(id);
      if (!image) {
        return res.status(404).json({ error: '图片不存在' });
      }

      try {
        await storageService.deleteFile(image.fileUrl);
      } catch (e) {
        logger.warn('删除存储文件失败:', e);
      }

      await image.destroy();

      res.json({ message: '图片删除成功' });
    } catch (error) {
      logger.error('删除图片失败:', error);
      res.status(500).json({ error: '删除图片失败' });
    }
  },

  async getPresignedUrl(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const image = await SpecimenImage.findByPk(id);
      if (!image) {
        return res.status(404).json({ error: '图片不存在' });
      }

      const presignedUrl = await storageService.generatePresignedUrl(image.fileName);

      res.json({ presignedUrl });
    } catch (error) {
      logger.error('获取预签名URL失败:', error);
      res.status(500).json({ error: '获取预签名URL失败' });
    }
  }
};
