import { Response } from 'express';
import { Op } from 'sequelize';
import { Specimen, SpecimenStatus } from '../models/Specimen.model';
import { SpecimenImage } from '../models/SpecimenImage.model';
import { Traceability } from '../models/Traceability.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';

export const specimenController = {
  async getAllSpecimens(req: AuthRequest, res: Response) {
    try {
      const {
        page = 1,
        limit = 10,
        search = '',
        category,
        status,
        sortBy = 'createdAt',
        sortOrder = 'DESC'
      } = req.query;

      const where: any = {};
      if (search) {
        where[Op.or] = [
          { name: { [Op.like]: `%${search}%` } },
          { scientificName: { [Op.like]: `%${search}%` } },
          { specimenNo: { [Op.like]: `%${search}%` } },
          { commonName: { [Op.like]: `%${search}%` } }
        ];
      }
      if (category) {
        where.category = category;
      }
      if (status) {
        where.status = status;
      }

      const { count, rows } = await Specimen.findAndCountAll({
        where,
        limit: Number(limit),
        offset: (Number(page) - 1) * Number(limit),
        order: [[String(sortBy), String(sortOrder)]],
        include: [
          {
            model: SpecimenImage,
            as: 'images',
            where: { isPrimary: true },
            required: false,
            limit: 1
          }
        ]
      });

      res.json({
        specimens: rows,
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / Number(limit))
      });
    } catch (error) {
      logger.error('获取标本列表失败:', error);
      res.status(500).json({ error: '获取标本列表失败' });
    }
  },

  async getSpecimenById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const specimen = await Specimen.findByPk(id, {
        include: [
          {
            model: SpecimenImage,
            as: 'images',
            order: [['sortOrder', 'ASC'], ['createdAt', 'DESC']]
          },
          {
            model: Traceability,
            as: 'traceabilityRecords',
            order: [['traceDate', 'DESC']]
          }
        ]
      });

      if (!specimen) {
        return res.status(404).json({ error: '标本不存在' });
      }

      res.json({ specimen });
    } catch (error) {
      logger.error('获取标本详情失败:', error);
      res.status(500).json({ error: '获取标本详情失败' });
    }
  },

  async createSpecimen(req: AuthRequest, res: Response) {
    try {
      const specimenData = req.body;

      if (!specimenData.specimenNo || !specimenData.name || !specimenData.scientificName) {
        return res.status(400).json({ error: '缺少必要字段' });
      }

      const existingSpecimen = await Specimen.findOne({ where: { specimenNo: specimenData.specimenNo } });
      if (existingSpecimen) {
        return res.status(400).json({ error: '标本编号已存在' });
      }

      const specimen = await Specimen.create({
        ...specimenData,
        createdBy: req.user?.id,
        status: SpecimenStatus.PENDING
      });

      res.status(201).json({
        specimen,
        message: '标本创建成功'
      });
    } catch (error) {
      logger.error('创建标本失败:', error);
      res.status(500).json({ error: '创建标本失败' });
    }
  },

  async updateSpecimen(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const specimen = await Specimen.findByPk(id);
      if (!specimen) {
        return res.status(404).json({ error: '标本不存在' });
      }

      await specimen.update(updateData);

      res.json({
        specimen,
        message: '标本更新成功'
      });
    } catch (error) {
      logger.error('更新标本失败:', error);
      res.status(500).json({ error: '更新标本失败' });
    }
  },

  async deleteSpecimen(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const specimen = await Specimen.findByPk(id);
      if (!specimen) {
        return res.status(404).json({ error: '标本不存在' });
      }

      await specimen.destroy();

      res.json({ message: '标本删除成功' });
    } catch (error) {
      logger.error('删除标本失败:', error);
      res.status(500).json({ error: '删除标本失败' });
    }
  },

  async verifySpecimen(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const specimen = await Specimen.findByPk(id);
      if (!specimen) {
        return res.status(404).json({ error: '标本不存在' });
      }

      await specimen.update({
        status: SpecimenStatus.VERIFIED,
        verifiedBy: req.user?.id,
        verifiedAt: new Date()
      });

      res.json({
        specimen,
        message: '标本审核通过'
      });
    } catch (error) {
      logger.error('审核标本失败:', error);
      res.status(500).json({ error: '审核标本失败' });
    }
  },

  async getCategories(req: AuthRequest, res: Response) {
    try {
      const categories = await Specimen.findAll({
        attributes: ['category'],
        group: ['category']
      });

      const categoryList = categories.map(c => c.category).filter(Boolean);

      res.json({ categories: categoryList });
    } catch (error) {
      logger.error('获取分类列表失败:', error);
      res.status(500).json({ error: '获取分类列表失败' });
    }
  },

  async getStats(req: AuthRequest, res: Response) {
    try {
      const total = await Specimen.count();
      const pending = await Specimen.count({ where: { status: SpecimenStatus.PENDING } });
      const verified = await Specimen.count({ where: { status: SpecimenStatus.VERIFIED } });
      const archived = await Specimen.count({ where: { status: SpecimenStatus.ARCHIVED } });

      const categoryStats = await Specimen.findAll({
        attributes: ['category', [Specimen.sequelize!.fn('COUNT', Specimen.sequelize!.col('id')), 'count']],
        group: ['category']
      });

      res.json({
        total,
        pending,
        verified,
        archived,
        categoryStats
      });
    } catch (error) {
      logger.error('获取统计数据失败:', error);
      res.status(500).json({ error: '获取统计数据失败' });
    }
  }
};
