import { Request, Response } from 'express';
import Joi from 'joi';
import { radarDataService } from './service';
import { success, error, serverError } from '../utils/response';
import logger from '../utils/logger';
import { RadarDataQuery } from '../models/radarData';

const uploadSchema = Joi.object({
  radarId: Joi.string().required(),
  timestamp: Joi.number().required(),
  dataType: Joi.string()
    .valid('reflectivity', 'velocity', 'spectrum_width', 'differential_reflectivity', 'correlation_coefficient')
    .required(),
  elevationAngle: Joi.number().required(),
  azimuthAngle: Joi.number().required(),
  range: Joi.number().required(),
  resolution: Joi.number().required(),
  data: Joi.array().items(Joi.number()).required(),
  quality: Joi.number().min(0).max(100).required(),
  checksum: Joi.string().required(),
});

export const uploadData = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error: validationError } = uploadSchema.validate(req.body);
    if (validationError) {
      error(res, 400, `参数验证失败: ${validationError.message}`);
      return;
    }

    const result = await radarDataService.uploadData(req.body);
    if (!result) {
      error(res, 500, '数据上传失败', 500);
      return;
    }

    success(res, result, '数据上传成功');
  } catch (err) {
    logger.error('上传雷达数据异常', { error: err });
    serverError(res, '数据上传异常');
  }
};

export const getData = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const data = await radarDataService.getData(id);

    if (!data) {
      error(res, 404, '数据不存在', 404);
      return;
    }

    success(res, data);
  } catch (err) {
    logger.error('获取雷达数据异常', { error: err });
    serverError(res, '获取数据异常');
  }
};

export const queryData = async (req: Request, res: Response): Promise<void> => {
  try {
    const query: RadarDataQuery = {
      radarId: req.query.radarId as string,
      startTime: req.query.startTime ? parseInt(req.query.startTime as string, 10) : undefined,
      endTime: req.query.endTime ? parseInt(req.query.endTime as string, 10) : undefined,
      dataType: req.query.dataType as any,
      elevationAngle: req.query.elevationAngle ? parseFloat(req.query.elevationAngle as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 100,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
    };

    const data = await radarDataService.queryData(query);
    success(res, {
      items: data,
      total: data.length,
      limit: query.limit,
      offset: query.offset,
    });
  } catch (err) {
    logger.error('查询雷达数据异常', { error: err });
    serverError(res, '查询数据异常');
  }
};

export const getLatestData = async (req: Request, res: Response): Promise<void> => {
  try {
    const { radarId } = req.params;
    const { dataType } = req.query;

    const data = await radarDataService.getLatestData(radarId, dataType as string);

    if (!data) {
      error(res, 404, '未找到最新数据', 404);
      return;
    }

    success(res, data);
  } catch (err) {
    logger.error('获取最新雷达数据异常', { error: err });
    serverError(res, '获取最新数据异常');
  }
};

export const deleteData = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await radarDataService.deleteData(id);

    if (!result) {
      error(res, 404, '数据不存在或删除失败', 404);
      return;
    }

    success(res, null, '删除成功');
  } catch (err) {
    logger.error('删除雷达数据异常', { error: err });
    serverError(res, '删除数据异常');
  }
};

export const getDataStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const count = await radarDataService.getDataCount();
    success(res, {
      totalCount: count,
    });
  } catch (err) {
    logger.error('获取雷达数据统计异常', { error: err });
    serverError(res, '获取统计数据异常');
  }
};
