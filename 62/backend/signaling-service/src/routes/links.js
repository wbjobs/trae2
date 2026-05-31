/**
 * 链路相关 REST 路由
 * GET /api/links - 查询所有链路
 * POST /api/links/:id/reset - 重置指定链路（模拟链路恢复）
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  try {
    const links = db.getAllLinks();

    const enriched = links.map(link => {
      const srcStation = db.getStationById(link.src_station);
      const dstStation = db.getStationById(link.dst_station);
      return {
        ...link,
        src_station_name: srcStation ? srcStation.name : '未知',
        dst_station_name: dstStation ? dstStation.name : '未知',
        src_station_line: srcStation ? srcStation.line : '',
        dst_station_line: dstStation ? dstStation.line : '',
      };
    });

    res.json({
      code: 0,
      message: 'success',
      data: enriched,
    });
  } catch (err) {
    console.error('[Route] 查询链路失败:', err);
    res.status(500).json({
      code: 500,
      message: '查询失败: ' + err.message,
      data: [],
    });
  }
});

router.post('/:id/reset', (req, res) => {
  const linkId = req.params.id;

  try {
    const link = db.getLinkById(linkId);

    if (!link) {
      return res.status(404).json({
        code: 404,
        message: '链路不存在',
      });
    }

    const now = new Date().toISOString();

    db.updateLinkStatus(linkId, 'normal', {
      latency: Math.floor(Math.random() * 20) + 5,
      packet_loss: 0,
      last_heartbeat: now,
    });

    db.insertAuditLog({
      id: uuidv4(),
      action: 'reset',
      entity_type: 'link',
      entity_id: linkId,
      operator: 'admin',
      detail: JSON.stringify({
        linkName: link.name,
        previousStatus: link.status,
        newStatus: 'normal',
        reason: req.body.reason || '手动重置',
      }),
      timestamp: now,
    });

    const updated = db.getLinkById(linkId);

    res.json({
      code: 0,
      message: '链路重置成功',
      data: updated,
    });
  } catch (err) {
    console.error('[Route] 重置链路失败:', err);
    res.status(500).json({
      code: 500,
      message: '重置失败: ' + err.message,
    });
  }
});

module.exports = router;