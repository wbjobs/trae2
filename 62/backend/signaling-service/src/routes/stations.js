/**
 * 车站节点 REST 路由
 * GET /api/stations - 查询所有车站节点
 * GET /api/stations/:id - 查询单个车站详情
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  try {
    const stations = db.getAllStations();

    res.json({
      code: 0,
      message: 'success',
      data: stations,
    });
  } catch (err) {
    console.error('[Route] 查询车站失败:', err);
    res.status(500).json({
      code: 500,
      message: '查询失败: ' + err.message,
      data: [],
    });
  }
});

router.get('/:id', (req, res) => {
  const id = req.params.id;

  try {
    const station = db.getStationById(id);

    if (!station) {
      return res.status(404).json({
        code: 404,
        message: '车站不存在',
        data: null,
      });
    }

    const links = db.getAllLinks();
    const stationLinks = links.filter(
      l => l.src_station === id || l.dst_station === id
    ).map(l => {
      const other = l.src_station === id ? l.dst_station : l.src_station;
      const otherStation = db.getStationById(other);
      return {
        id: l.id,
        name: l.name,
        link_type: l.link_type,
        status: l.status,
        latency: l.latency,
        peer_station: otherStation ? otherStation.name : '未知',
      };
    });

    res.json({
      code: 0,
      message: 'success',
      data: {
        ...station,
        links: stationLinks,
        link_count: stationLinks.length,
      },
    });
  } catch (err) {
    console.error('[Route] 查询车站详情失败:', err);
    res.status(500).json({
      code: 500,
      message: '查询失败: ' + err.message,
      data: null,
    });
  }
});

module.exports = router;