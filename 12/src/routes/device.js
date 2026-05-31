const express = require('express');
const router = express.Router();
const queueService = require('../queue');
const databaseService = require('../database/influxdb');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

router.post('/report', async (req, res) => {
  try {
    const data = req.validatedData;
    const requestId = uuidv4();

    const queueData = {
      ...data,
      requestId,
      receivedAt: Date.now(),
      workerPid: process.pid
    };

    const job = await queueService.addDeviceData(queueData);

    logger.info(`数据上报成功: 设备=${data.deviceId}, 请求ID=${requestId}, JobID=${job.id}`);

    res.status(202).json({
      success: true,
      message: '数据已接收并加入处理队列',
      code: 'ACCEPTED',
      data: {
        requestId,
        jobId: job.id,
        deviceId: data.deviceId,
        pointsCount: data.points.length
      }
    });
  } catch (error) {
    logger.error(`数据上报失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '数据处理失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.post('/report/batch', async (req, res) => {
  try {
    const dataArray = req.validatedData;
    const requestId = uuidv4();

    const queueDataArray = dataArray.map(data => ({
      ...data,
      requestId,
      receivedAt: Date.now(),
      workerPid: process.pid
    }));

    const jobs = await queueService.addBatchDeviceData(queueDataArray);

    logger.info(`批量数据上报成功: 设备数量=${dataArray.length}, 请求ID=${requestId}`);

    res.status(202).json({
      success: true,
      message: '批量数据已接收并加入处理队列',
      code: 'ACCEPTED',
      data: {
        requestId,
        jobCount: jobs.length,
        devices: dataArray.map(d => ({
          deviceId: d.deviceId,
          pointsCount: d.points.length
        }))
      }
    });
  } catch (error) {
    logger.error(`批量数据上报失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '批量数据处理失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.get('/query', async (req, res) => {
  try {
    const options = req.validatedQuery;
    const data = await databaseService.queryData(options);

    res.json({
      success: true,
      message: '查询成功',
      code: 'SUCCESS',
      data: {
        count: data.length,
        records: data
      }
    });
  } catch (error) {
    logger.error(`数据查询失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '数据查询失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.get('/latest/:deviceId/:tagId', async (req, res) => {
  try {
    const { deviceId, tagId } = req.params;
    const data = await databaseService.getLatestData(deviceId, tagId);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: '未找到数据',
        code: 'NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: '查询成功',
      code: 'SUCCESS',
      data
    });
  } catch (error) {
    logger.error(`获取最新数据失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '获取最新数据失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.get('/devices', async (req, res) => {
  try {
    const devices = await databaseService.getDeviceList();

    res.json({
      success: true,
      message: '查询成功',
      code: 'SUCCESS',
      data: {
        count: devices.length,
        devices
      }
    });
  } catch (error) {
    logger.error(`获取设备列表失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '获取设备列表失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

router.get('/tags/:deviceId?', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const tags = await databaseService.getTagList(deviceId);

    res.json({
      success: true,
      message: '查询成功',
      code: 'SUCCESS',
      data: {
        count: tags.length,
        tags,
        deviceId: deviceId || 'all'
      }
    });
  } catch (error) {
    logger.error(`获取标签列表失败: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '获取标签列表失败',
      code: 'INTERNAL_ERROR',
      error: error.message
    });
  }
});

module.exports = router;
