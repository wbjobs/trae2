import { Response } from 'express';
import { Op } from 'sequelize';
import { Sharing, SharingLevel } from '../models/Sharing.model';
import { Specimen } from '../models/Specimen.model';
import { User } from '../models/User.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';

export const sharingController = {
  async createSharing(req: AuthRequest, res: Response) {
    try {
      const { specimenId, sharingLevel, sharedWith, expiresAt, permissions } = req.body;

      if (!specimenId || !sharingLevel) {
        return res.status(400).json({ error: '缺少必要字段' });
      }

      const specimen = await Specimen.findByPk(specimenId);
      if (!specimen) {
        return res.status(404).json({ error: '标本不存在' });
      }

      if (sharingLevel === SharingLevel.PRIVATE && !sharedWith) {
        return res.status(400).json({ error: '私有共享需要指定共享对象' });
      }

      const existingSharing = await Sharing.findOne({
        where: {
          specimenId,
          sharingLevel,
          sharedWith: sharedWith || null
        }
      });

      if (existingSharing) {
        return res.status(400).json({ error: '该共享已存在' });
      }

      const sharing = await Sharing.create({
        specimenId,
        sharedBy: req.user!.id,
        sharingLevel,
        sharedWith: sharedWith || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        permissions: permissions || 'read'
      });

      res.status(201).json({
        sharing,
        message: '共享创建成功'
      });
    } catch (error) {
      logger.error('创建共享失败:', error);
      res.status(500).json({ error: '创建共享失败' });
    }
  },

  async getSharingsBySpecimen(req: AuthRequest, res: Response) {
    try {
      const { specimenId } = req.params;

      const sharings = await Sharing.findAll({
        where: { specimenId: Number(specimenId) },
        include: [
          {
            model: User,
            as: 'sharedByUser',
            attributes: ['id', 'username', 'fullName']
          },
          {
            model: User,
            as: 'sharedWithUser',
            attributes: ['id', 'username', 'fullName']
          }
        ],
        order: [['createdAt', 'DESC']]
      });

      res.json({ sharings });
    } catch (error) {
      logger.error('获取共享列表失败:', error);
      res.status(500).json({ error: '获取共享列表失败' });
    }
  },

  async getMySharedSpecimens(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 20 } = req.query;

      const { count, rows } = await Sharing.findAndCountAll({
        where: { sharedBy: req.user!.id },
        include: [
          {
            model: Specimen,
            as: 'specimen',
            include: [
              {
                model: User,
                as: 'creator',
                attributes: ['id', 'fullName']
              }
            ]
          },
          {
            model: User,
            as: 'sharedWithUser',
            attributes: ['id', 'username', 'fullName']
          }
        ],
        limit: Number(limit),
        offset: (Number(page) - 1) * Number(limit),
        order: [['createdAt', 'DESC']]
      });

      res.json({
        sharings: rows,
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / Number(limit))
      });
    } catch (error) {
      logger.error('获取我的共享失败:', error);
      res.status(500).json({ error: '获取我的共享失败' });
    }
  },

  async getSharedWithMe(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 20, search } = req.query;
      const userId = req.user!.id;

      const where: any = {
        [Op.or]: [
          { sharingLevel: SharingLevel.PUBLIC },
          { sharingLevel: SharingLevel.INTERNAL },
          {
            sharingLevel: SharingLevel.PRIVATE,
            sharedWith: userId
          }
        ]
      };

      const { count, rows } = await Sharing.findAndCountAll({
        where,
        include: [
          {
            model: Specimen,
            as: 'specimen',
            where: search ? {
              [Op.or]: [
                { name: { [Op.like]: `%${search}%` } },
                { scientificName: { [Op.like]: `%${search}%` } },
                { specimenNo: { [Op.like]: `%${search}%` } }
              ]
            } : undefined,
            include: [
              {
                model: User,
                as: 'creator',
                attributes: ['id', 'fullName', 'department']
              }
            ]
          },
          {
            model: User,
            as: 'sharedByUser',
            attributes: ['id', 'username', 'fullName', 'department']
          }
        ],
        limit: Number(limit),
        offset: (Number(page) - 1) * Number(limit),
        order: [['createdAt', 'DESC']]
      });

      res.json({
        sharings: rows,
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / Number(limit))
      });
    } catch (error) {
      logger.error('获取共享给我的标本失败:', error);
      res.status(500).json({ error: '获取共享给我的标本失败' });
    }
  },

  async updateSharing(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { sharingLevel, sharedWith, expiresAt, permissions } = req.body;

      const sharing = await Sharing.findByPk(id);
      if (!sharing) {
        return res.status(404).json({ error: '共享不存在' });
      }

      if (sharing.sharedBy !== req.user!.id) {
        return res.status(403).json({ error: '无权限修改此共享' });
      }

      await sharing.update({
        sharingLevel: sharingLevel || sharing.sharingLevel,
        sharedWith: sharedWith !== undefined ? sharedWith : sharing.sharedWith,
        expiresAt: expiresAt ? new Date(expiresAt) : sharing.expiresAt,
        permissions: permissions || sharing.permissions
      });

      res.json({
        sharing,
        message: '共享更新成功'
      });
    } catch (error) {
      logger.error('更新共享失败:', error);
      res.status(500).json({ error: '更新共享失败' });
    }
  },

  async deleteSharing(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const sharing = await Sharing.findByPk(id);
      if (!sharing) {
        return res.status(404).json({ error: '共享不存在' });
      }

      if (sharing.sharedBy !== req.user!.id) {
        return res.status(403).json({ error: '无权限删除此共享' });
      }

      await sharing.destroy();

      res.json({ message: '共享删除成功' });
    } catch (error) {
      logger.error('删除共享失败:', error);
      res.status(500).json({ error: '删除共享失败' });
    }
  },

  async checkSharingPermission(req: AuthRequest, res: Response) {
    try {
      const { specimenId } = req.params;
      const userId = req.user!.id;

      const specimen = await Specimen.findByPk(specimenId);
      if (!specimen) {
        return res.status(404).json({ error: '标本不存在' });
      }

      if (specimen.createdBy === userId) {
        return res.json({
          hasPermission: true,
          permission: 'owner',
          sharingLevel: null
        });
      }

      const sharing = await Sharing.findOne({
        where: {
          specimenId: Number(specimenId),
          [Op.or]: [
            { sharingLevel: SharingLevel.PUBLIC },
            { sharingLevel: SharingLevel.INTERNAL },
            {
              sharingLevel: SharingLevel.PRIVATE,
              sharedWith: userId
            }
          ]
        }
      });

      if (sharing) {
        const now = new Date();
        if (sharing.expiresAt && new Date(sharing.expiresAt) < now) {
          return res.json({
            hasPermission: false,
            permission: null,
            sharingLevel: null,
            reason: '共享已过期'
          });
        }

        return res.json({
          hasPermission: true,
          permission: sharing.permissions,
          sharingLevel: sharing.sharingLevel
        });
      }

      res.json({
        hasPermission: false,
        permission: null,
        sharingLevel: null
      });
    } catch (error) {
      logger.error('检查共享权限失败:', error);
      res.status(500).json({ error: '检查共享权限失败' });
    }
  }
};
