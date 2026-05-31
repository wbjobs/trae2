import { Response } from 'express';
import { Op, Sequelize } from 'sequelize';
import { SpecimenImage, ImageType } from '../models/SpecimenImage.model';
import { Specimen } from '../models/Specimen.model';
import { User } from '../models/User.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';

export const searchController = {
  async searchImages(req: AuthRequest, res: Response) {
    try {
      const {
        keyword,
        tags,
        imageType,
        specimenId,
        color,
        startDate,
        endDate,
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'DESC'
      } = req.query;

      const where: any = {};

      if (keyword) {
        where[Op.or] = [
          { originalName: { [Op.like]: `%${keyword}%` } },
          { description: { [Op.like]: `%${keyword}%` } },
          { tags: { [Op.like]: `%${keyword}%` } },
          { '$specimen.name$': { [Op.like]: `%${keyword}%` } },
          { '$specimen.scientificName$': { [Op.like]: `%${keyword}%` } }
        ];
      }

      if (tags) {
        const tagArray = (tags as string).split(',').map(t => t.trim());
        where[Op.and] = tagArray.map(tag => ({
          tags: { [Op.like]: `%${tag}%` }
        }));
      }

      if (imageType) {
        where.imageType = imageType;
      }

      if (specimenId) {
        where.specimenId = specimenId;
      }

      if (color) {
        where[Op.or] = [
          { dominantColors: { [Op.like]: `%${color}%` } },
          { colorPalette: { [Op.like]: `%${color}%` } }
        ];
      }

      if (startDate && endDate) {
        where.createdAt = {
          [Op.between]: [new Date(startDate as string), new Date(endDate as string)]
        };
      }

      const { count, rows } = await SpecimenImage.findAndCountAll({
        where,
        include: [
          {
            model: Specimen,
            as: 'specimen',
            attributes: ['id', 'specimenNo', 'name', 'scientificName']
          },
          {
            model: User,
            as: 'uploader',
            attributes: ['id', 'username', 'fullName']
          }
        ],
        limit: Number(limit),
        offset: (Number(page) - 1) * Number(limit),
        order: [[sortBy as string, sortOrder as string]]
      });

      res.json({
        images: rows,
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / Number(limit))
      });
    } catch (error) {
      logger.error('搜索图片失败:', error);
      res.status(500).json({ error: '搜索图片失败' });
    }
  },

  async getTagCloud(req: AuthRequest, res: Response) {
    try {
      const images = await SpecimenImage.findAll({
        attributes: ['tags'],
        where: {
          tags: {
            [Op.ne]: null
          }
        },
        limit: 1000
      });

      const tagCount: Record<string, number> = {};
      
      images.forEach(img => {
        if (img.tags) {
          const tags = img.tags.split(',').map(t => t.trim()).filter(t => t);
          tags.forEach(tag => {
            tagCount[tag] = (tagCount[tag] || 0) + 1;
          });
        }
      });

      const tagCloud = Object.entries(tagCount)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 50);

      res.json({ tagCloud });
    } catch (error) {
      logger.error('获取标签云失败:', error);
      res.status(500).json({ error: '获取标签云失败' });
    }
  },

  async searchSpecimens(req: AuthRequest, res: Response) {
    try {
      const {
        keyword,
        category,
        status,
        startDate,
        endDate,
        page = 1,
        limit = 20
      } = req.query;

      const where: any = {};

      if (keyword) {
        where[Op.or] = [
          { name: { [Op.like]: `%${keyword}%` } },
          { scientificName: { [Op.like]: `%${keyword}%` } },
          { specimenNo: { [Op.like]: `%${keyword}%` } },
          { kingdom: { [Op.like]: `%${keyword}%` } },
          { phylum: { [Op.like]: `%${keyword}%` } },
          { className: { [Op.like]: `%${keyword}%` } },
          { order: { [Op.like]: `%${keyword}%` } },
          { family: { [Op.like]: `%${keyword}%` } },
          { genus: { [Op.like]: `%${keyword}%` } },
          { species: { [Op.like]: `%${keyword}%` } },
          { collectionLocation: { [Op.like]: `%${keyword}%` } },
          { description: { [Op.like]: `%${keyword}%` } }
        ];
      }

      if (category) {
        where[Op.or] = [
          { kingdom: category },
          { phylum: category },
          { className: category },
          { order: category },
          { family: category }
        ];
      }

      if (status) {
        where.status = status;
      }

      if (startDate && endDate) {
        where.createdAt = {
          [Op.between]: [new Date(startDate as string), new Date(endDate as string)]
        };
      }

      const { count, rows } = await Specimen.findAndCountAll({
        where,
        include: [
          {
            model: User,
            as: 'creator',
            attributes: ['id', 'fullName']
          }
        ],
        limit: Number(limit),
        offset: (Number(page) - 1) * Number(limit),
        order: [['createdAt', 'DESC']]
      });

      res.json({
        specimens: rows,
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / Number(limit))
      });
    } catch (error) {
      logger.error('搜索标本失败:', error);
      res.status(500).json({ error: '搜索标本失败' });
    }
  },

  async getSearchSuggestions(req: AuthRequest, res: Response) {
    try {
      const { keyword, type = 'all' } = req.query;

      if (!keyword) {
        return res.json({ suggestions: [] });
      }

      const suggestions: any[] = [];
      const keywordPattern = `%${keyword}%`;

      if (type === 'all' || type === 'specimen') {
        const specimens = await Specimen.findAll({
          where: {
            [Op.or]: [
              { name: { [Op.like]: keywordPattern } },
              { scientificName: { [Op.like]: keywordPattern } },
              { specimenNo: { [Op.like]: keywordPattern } }
            ]
          },
          limit: 5,
          attributes: ['id', 'name', 'scientificName', 'specimenNo']
        });

        suggestions.push(
          ...specimens.map(s => ({
            type: 'specimen',
            id: s.id,
            text: s.name,
            subtext: s.scientificName || s.specimenNo
          }))
        );
      }

      if (type === 'all' || type === 'image') {
        const images = await SpecimenImage.findAll({
          where: {
            [Op.or]: [
              { originalName: { [Op.like]: keywordPattern } },
              { tags: { [Op.like]: keywordPattern } }
            ]
          },
          limit: 5,
          attributes: ['id', 'originalName', 'tags', 'fileUrl'],
          include: [
            {
              model: Specimen,
              as: 'specimen',
              attributes: ['name']
            }
          ]
        });

        suggestions.push(
          ...images.map(img => ({
            type: 'image',
            id: img.id,
            text: img.originalName,
            subtext: (img as any).specimen?.name || '',
            image: img.fileUrl
          }))
        );
      }

      if (type === 'all' || type === 'tag') {
        const tags = await SpecimenImage.findAll({
          attributes: ['tags'],
          where: {
            tags: { [Op.like]: keywordPattern }
          },
          limit: 10
        });

        const uniqueTags = new Set<string>();
        tags.forEach(img => {
          if (img.tags) {
            img.tags.split(',').map(t => t.trim()).filter(t => 
              t.toLowerCase().includes((keyword as string).toLowerCase())
            ).forEach(t => uniqueTags.add(t));
          }
        });

        suggestions.push(
          ...Array.from(uniqueTags).slice(0, 5).map(tag => ({
            type: 'tag',
            text: tag,
            subtext: '标签'
          }))
        );
      }

      res.json({ suggestions: suggestions.slice(0, 15) });
    } catch (error) {
      logger.error('获取搜索建议失败:', error);
      res.status(500).json({ error: '获取搜索建议失败' });
    }
  }
};
