import { v4 as uuidv4 } from 'uuid';
import { RadarBaseData, RadarDataUploadRequest, RadarDataQuery } from '../models/radarData';
import { redisClient } from '../cache/redis';
import logger from '../utils/logger';

const DATA_KEY_PREFIX = 'radar:data:';
const DATA_INDEX_KEY = 'radar:data:index';
const DATA_TTL = 60 * 60 * 24 * 7;

class RadarDataService {
  async uploadData(request: RadarDataUploadRequest): Promise<RadarBaseData | null> {
    try {
      const data: RadarBaseData = {
        id: uuidv4(),
        ...request,
      };

      const dataKey = `${DATA_KEY_PREFIX}${data.id}`;
      const dataStr = JSON.stringify(data);

      await redisClient.set(dataKey, dataStr, DATA_TTL);
      await redisClient.lpush(DATA_INDEX_KEY, data.id);

      logger.info('雷达数据接收成功', {
        dataId: data.id,
        radarId: data.radarId,
        dataType: data.dataType,
        timestamp: data.timestamp,
      });

      return data;
    } catch (err) {
      logger.error('雷达数据接收失败', { error: err, request });
      return null;
    }
  }

  async getData(dataId: string): Promise<RadarBaseData | null> {
    try {
      const dataKey = `${DATA_KEY_PREFIX}${dataId}`;
      const dataStr = await redisClient.get(dataKey);
      if (!dataStr) return null;
      return JSON.parse(dataStr) as RadarBaseData;
    } catch (err) {
      logger.error('获取雷达数据失败', { dataId, error: err });
      return null;
    }
  }

  async queryData(query: RadarDataQuery): Promise<RadarBaseData[]> {
    try {
      const results: RadarBaseData[] = [];
      const limit = query.limit || 100;
      const offset = query.offset || 0;

      const indexKey = DATA_INDEX_KEY;
      const client = redisClient.getClient();
      if (!client) return [];

      const dataIds = await client.lrange(indexKey, offset, offset + limit - 1);

      for (const dataId of dataIds) {
        const data = await this.getData(dataId);
        if (!data) continue;

        let match = true;

        if (query.radarId && data.radarId !== query.radarId) match = false;
        if (query.dataType && data.dataType !== query.dataType) match = false;
        if (query.startTime && data.timestamp < query.startTime) match = false;
        if (query.endTime && data.timestamp > query.endTime) match = false;
        if (query.elevationAngle && data.elevationAngle !== query.elevationAngle) match = false;

        if (match) {
          results.push(data);
        }
      }

      return results;
    } catch (err) {
      logger.error('查询雷达数据失败', { query, error: err });
      return [];
    }
  }

  async getLatestData(radarId: string, dataType?: string): Promise<RadarBaseData | null> {
    try {
      const client = redisClient.getClient();
      if (!client) return null;

      const dataIds = await client.lrange(DATA_INDEX_KEY, 0, 99);

      for (const dataId of dataIds) {
        const data = await this.getData(dataId);
        if (!data) continue;

        if (data.radarId === radarId && (!dataType || data.dataType === dataType)) {
          return data;
        }
      }

      return null;
    } catch (err) {
      logger.error('获取最新雷达数据失败', { radarId, dataType, error: err });
      return null;
    }
  }

  async deleteData(dataId: string): Promise<boolean> {
    try {
      const dataKey = `${DATA_KEY_PREFIX}${dataId}`;
      await redisClient.del(dataKey);
      logger.info('雷达数据删除成功', { dataId });
      return true;
    } catch (err) {
      logger.error('删除雷达数据失败', { dataId, error: err });
      return false;
    }
  }

  async getDataCount(): Promise<number> {
    try {
      const client = redisClient.getClient();
      if (!client) return 0;
      return await client.llen(DATA_INDEX_KEY);
    } catch (err) {
      logger.error('获取雷达数据数量失败', { error: err });
      return 0;
    }
  }
}

export const radarDataService = new RadarDataService();
