import { Response } from 'express';
import { Op } from 'sequelize';
import { Traceability, TraceType } from '../models/Traceability.model';
import { Specimen } from '../models/Specimen.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';

const isValidCoordinate = (lat: any, lng: any): boolean => {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (isNaN(latitude) || isNaN(longitude)) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  return true;
};

export const traceabilityController = {
  async getAllTraceRecords(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 20, specimenId, traceType, startDate, endDate } = req.query;

      const where: any = {};
      if (specimenId) {
        where.specimenId = specimenId;
      }
      if (traceType) {
        where.traceType = traceType;
      }
      if (startDate && endDate) {
        where.traceDate = {
          [Op.between]: [new Date(startDate as string), new Date(endDate as string)]
        };
      }

      const { count, rows } = await Traceability.findAndCountAll({
        where,
        limit: Number(limit),
        offset: (Number(page) - 1) * Number(limit),
        order: [['traceDate', 'DESC']],
        include: [
          {
            model: Specimen,
            as: 'specimen',
            attributes: ['id', 'specimenNo', 'name', 'scientificName']
          }
        ]
      });

      res.json({
        records: rows,
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / Number(limit))
      });
    } catch (error) {
      logger.error('获取溯源记录失败:', error);
      res.status(500).json({ error: '获取溯源记录失败' });
    }
  },

  async getTraceRecordsBySpecimenId(req: AuthRequest, res: Response) {
    try {
      const { specimenId } = req.params;

      const records = await Traceability.findAll({
        where: { specimenId: Number(specimenId) },
        order: [['traceDate', 'ASC']]
      });

      res.json({ records });
    } catch (error) {
      logger.error('获取标本溯源记录失败:', error);
      res.status(500).json({ error: '获取标本溯源记录失败' });
    }
  },

  async getTraceRecordById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const record = await Traceability.findByPk(id, {
        include: [
          {
            model: Specimen,
            as: 'specimen',
            attributes: ['id', 'specimenNo', 'name']
          }
        ]
      });

      if (!record) {
        return res.status(404).json({ error: '溯源记录不存在' });
      }

      res.json({ record });
    } catch (error) {
      logger.error('获取溯源记录详情失败:', error);
      res.status(500).json({ error: '获取溯源记录详情失败' });
    }
  },

  async createTraceRecord(req: AuthRequest, res: Response) {
    try {
      const recordData = req.body;

      if (!recordData.specimenId || !recordData.title || !recordData.traceType || !recordData.traceDate) {
        return res.status(400).json({ error: '缺少必要字段' });
      }

      const specimen = await Specimen.findByPk(recordData.specimenId);
      if (!specimen) {
        return res.status(404).json({ error: '标本不存在' });
      }

      if (recordData.latitude !== undefined && recordData.latitude !== null && recordData.longitude !== undefined && recordData.longitude !== null) {
        if (!isValidCoordinate(recordData.latitude, recordData.longitude)) {
          return res.status(400).json({ error: '坐标格式不正确，纬度范围-90~90，经度范围-180~180' });
        }
      }

      const record = await Traceability.create({
        ...recordData,
        operatorId: req.user?.id,
        operator: req.user?.username
      });

      res.status(201).json({
        record,
        message: '溯源记录创建成功'
      });
    } catch (error) {
      logger.error('创建溯源记录失败:', error);
      res.status(500).json({ error: '创建溯源记录失败' });
    }
  },

  async updateTraceRecord(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const record = await Traceability.findByPk(id);
      if (!record) {
        return res.status(404).json({ error: '溯源记录不存在' });
      }

      const newLat = updateData.latitude !== undefined ? updateData.latitude : record.latitude;
      const newLng = updateData.longitude !== undefined ? updateData.longitude : record.longitude;
      
      if (newLat !== undefined && newLat !== null && newLng !== undefined && newLng !== null) {
        if (!isValidCoordinate(newLat, newLng)) {
          return res.status(400).json({ error: '坐标格式不正确，纬度范围-90~90，经度范围-180~180' });
        }
      }

      await record.update(updateData);

      res.json({
        record,
        message: '溯源记录更新成功'
      });
    } catch (error) {
      logger.error('更新溯源记录失败:', error);
      res.status(500).json({ error: '更新溯源记录失败' });
    }
  },

  async deleteTraceRecord(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const record = await Traceability.findByPk(id);
      if (!record) {
        return res.status(404).json({ error: '溯源记录不存在' });
      }

      await record.destroy();

      res.json({ message: '溯源记录删除成功' });
    } catch (error) {
      logger.error('删除溯源记录失败:', error);
      res.status(500).json({ error: '删除溯源记录失败' });
    }
  },

  async getTraceTypes(req: AuthRequest, res: Response) {
    try {
      res.json({
        traceTypes: Object.values(TraceType).map(type => ({
          value: type,
          label: getTraceTypeLabel(type)
        }))
      });
    } catch (error) {
      logger.error('获取溯源类型失败:', error);
      res.status(500).json({ error: '获取溯源类型失败' });
    }
  },

  async getTraceMapData(req: AuthRequest, res: Response) {
    try {
      const { specimenId } = req.params;

      const records = await Traceability.findAll({
        where: {
          specimenId: Number(specimenId),
          latitude: { [Op.ne]: null },
          longitude: { [Op.ne]: null }
        },
        order: [['traceDate', 'ASC']]
      });

      const validRecords = records.filter(record => 
        isValidCoordinate(record.latitude, record.longitude)
      );

      const mapData = validRecords.map(record => ({
        id: record.id,
        title: record.title,
        traceType: record.traceType,
        location: record.location,
        coordinates: record.latitude && record.longitude ? [Number(record.longitude), Number(record.latitude)] : null,
        date: record.traceDate,
        operator: record.operator,
        description: record.description
      }));

      res.json({ mapData });
    } catch (error) {
      logger.error('获取溯源地图数据失败:', error);
      res.status(500).json({ error: '获取溯源地图数据失败' });
    }
  }
};

function getTraceTypeLabel(type: TraceType): string {
  const labels: Record<TraceType, string> = {
    [TraceType.COLLECTION]: '采集',
    [TraceType.TRANSPORT]: '运输',
    [TraceType.PROCESSING]: '处理',
    [TraceType.STORAGE]: '入库',
    [TraceType.EXHIBITION]: '展出',
    [TraceType.RESEARCH]: '研究',
    [TraceType.RESTORATION]: '修复',
    [TraceType.OTHER]: '其他'
  };
  return labels[type] || type;
}
