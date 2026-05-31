const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');

router.get('/trait/yearly-comparison', (req, res) => {
  try {
    const db = getDb();
    const { germplasm_id, trait_name, years } = req.query;

    if (!germplasm_id) {
      return res.status(400).json({ code: 400, message: '请指定种质资源ID' });
    }

    let yearList = [];
    if (years) {
      yearList = years.split(',').map(y => parseInt(y.trim())).filter(y => !isNaN(y));
    }
    if (yearList.length === 0) {
      const currentYear = new Date().getFullYear();
      yearList = [currentYear - 2, currentYear - 1, currentYear];
    }

    let traitNames = [];
    if (trait_name) {
      traitNames = [trait_name];
    } else {
      const distinctTraits = db.prepare(`
        SELECT DISTINCT trait_name FROM traits 
        WHERE germplasm_id = ?
        ORDER BY trait_name
      `).all(germplasm_id);
      traitNames = distinctTraits.map(t => t.trait_name).slice(0, 10);
    }

    const result = {
      germplasm_id: parseInt(germplasm_id),
      years: yearList,
      traits: []
    };

    for (const tn of traitNames) {
      const traitData = { trait_name: tn, yearly_data: [] };

      for (const year of yearList) {
        const yearData = {
          year,
          records: [],
          avg_value: null,
          min_value: null,
          max_value: null,
          count: 0
        };

        const records = db.prepare(`
          SELECT t.*, g.name as germplasm_name, g.resource_no
          FROM traits t
          LEFT JOIN germplasm g ON t.germplasm_id = g.id
          WHERE t.germplasm_id = ? 
            AND t.trait_name = ?
            AND CAST(strftime('%Y', t.observation_date) AS INTEGER) = ?
          ORDER BY t.observation_date
        `).all(germplasm_id, tn, year);

        const numericValues = records
          .map(r => parseFloat(r.trait_value))
          .filter(v => !isNaN(v));

        if (numericValues.length > 0) {
          yearData.avg_value = parseFloat((numericValues.reduce((a, b) => a + b, 0) / numericValues.length).toFixed(4));
          yearData.min_value = Math.min(...numericValues);
          yearData.max_value = Math.max(...numericValues);
        }
        yearData.count = records.length;
        yearData.records = records.slice(0, 20);

        traitData.yearly_data.push(yearData);
      }

      result.traits.push(traitData);
    }

    res.json({ code: 200, data: result });
  } catch (err) {
    console.error('年度对比查询错误:', err);
    res.status(500).json({ code: 500, message: '查询失败: ' + err.message });
  }
});

router.get('/trait/trend', (req, res) => {
  try {
    const db = getDb();
    const { germplasm_id, trait_name, start_date, end_date, interval = 'month' } = req.query;

    if (!germplasm_id || !trait_name) {
      return res.status(400).json({ code: 400, message: '请指定种质资源ID和性状名称' });
    }

    let dateFormat = '%Y-%m';
    if (interval === 'week') {
      dateFormat = '%Y-%W';
    } else if (interval === 'day') {
      dateFormat = '%Y-%m-%d';
    } else if (interval === 'quarter') {
      dateFormat = '%Y-Q%q';
    }

    let whereSql = 'WHERE germplasm_id = ? AND trait_name = ?';
    const params = [germplasm_id, trait_name];

    if (start_date) {
      whereSql += ' AND observation_date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      whereSql += ' AND observation_date <= ?';
      params.push(end_date);
    }

    const rows = db.prepare(`
      SELECT 
        strftime(?, observation_date) as period,
        COUNT(*) as count,
        trait_value
      FROM traits
      ${whereSql}
      GROUP BY period
      ORDER BY period
    `).all(dateFormat, ...params);

    const trend = rows.map(row => {
      const values = row.trait_value ? row.trait_value.split(',').map(v => parseFloat(v)).filter(v => !isNaN(v)) : [];
      return {
        period: row.period,
        count: row.count,
        avg_value: values.length > 0 ? parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(4)) : null,
        raw_value: row.trait_value
      };
    });

    res.json({ code: 200, data: { trend, interval } });
  } catch (err) {
    console.error('性状趋势查询错误:', err);
    res.status(500).json({ code: 500, message: '查询失败: ' + err.message });
  }
});

router.get('/distribution/heatmap', (req, res) => {
  try {
    const db = getDb();
    const { classification_id, include_children = 'true' } = req.query;

    let classIds = [];
    if (classification_id) {
      classIds.push(parseInt(classification_id));
      if (include_children === 'true') {
        const stack = [parseInt(classification_id)];
        while (stack.length > 0) {
          const currentId = stack.pop();
          const children = db.prepare('SELECT id FROM classifications WHERE parent_id = ?').all(currentId);
          for (const child of children) {
            classIds.push(child.id);
            stack.push(child.id);
          }
        }
      }
    }

    let whereSql = 'WHERE g.origin_latitude IS NOT NULL AND g.origin_longitude IS NOT NULL';
    const params = [];

    if (classIds.length > 0) {
      const placeholders = classIds.map(() => '?').join(',');
      whereSql += ` AND g.classification_id IN (${placeholders})`;
      params.push(...classIds);
    }

    const rows = db.prepare(`
      SELECT 
        g.id, g.resource_no, g.name, g.english_name,
        g.origin, g.origin_latitude, g.origin_longitude, g.origin_address,
        g.classification_id, c.name as classification_name, c.code as classification_code,
        g.material_type, g.year_collected, g.created_at,
        (SELECT COUNT(*) FROM traits t WHERE t.germplasm_id = g.id) as trait_count,
        (SELECT COUNT(*) FROM field_images fi WHERE fi.germplasm_id = g.id) as image_count
      FROM germplasm g
      LEFT JOIN classifications c ON g.classification_id = c.id
      ${whereSql}
      ORDER BY g.created_at DESC
    `).all(...params);

    const gridSize = 1.0;
    const heatmapData = {};

    for (const row of rows) {
      const latKey = Math.floor(row.origin_latitude / gridSize) * gridSize;
      const lngKey = Math.floor(row.origin_longitude / gridSize) * gridSize;
      const gridKey = `${latKey.toFixed(1)}_${lngKey.toFixed(1)}`;

      if (!heatmapData[gridKey]) {
        heatmapData[gridKey] = {
          lat: latKey + gridSize / 2,
          lng: lngKey + gridSize / 2,
          count: 0,
          germplasm_ids: [],
          classifications: new Set()
        };
      }

      heatmapData[gridKey].count++;
      heatmapData[gridKey].germplasm_ids.push(row.id);
      if (row.classification_name) {
        heatmapData[gridKey].classifications.add(row.classification_name);
      }
    }

    const heatmap = Object.values(heatmapData).map(item => ({
      lat: item.lat,
      lng: item.lng,
      count: item.count,
      germplasm_count: item.germplasm_ids.length,
      classifications: Array.from(item.classifications)
    })).sort((a, b) => b.count - a.count);

    const stats = {
      total_with_location: rows.length,
      total_heat_points: heatmap.length,
      max_density: heatmap.length > 0 ? heatmap[0].count : 0,
      avg_density: rows.length > 0 ? parseFloat((rows.length / Math.max(heatmap.length, 1)).toFixed(2)) : 0
    };

    res.json({ 
      code: 200, 
      data: { 
        heatmap, 
        raw_points: rows.slice(0, 100),
        stats 
      } 
    });
  } catch (err) {
    console.error('热力图数据查询错误:', err);
    res.status(500).json({ code: 500, message: '查询失败: ' + err.message });
  }
});

router.get('/distribution/by-region', (req, res) => {
  try {
    const db = getDb();

    const rows = db.prepare(`
      SELECT 
        origin,
        COUNT(*) as count,
        GROUP_CONCAT(DISTINCT classification_id) as classification_ids
      FROM germplasm
      WHERE origin IS NOT NULL AND origin != ''
      GROUP BY origin
      ORDER BY count DESC
      LIMIT 50
    `).all();

    const regions = rows.map(row => {
      const classIds = row.classification_ids ? row.classification_ids.split(',').map(Number) : [];
      return {
        region: row.origin,
        count: row.count,
        classification_count: classIds.length
      };
    });

    res.json({ code: 200, data: regions });
  } catch (err) {
    console.error('区域分布查询错误:', err);
    res.status(500).json({ code: 500, message: '查询失败: ' + err.message });
  }
});

router.get('/classification/stats', (req, res) => {
  try {
    const db = getDb();

    const stats = db.prepare(`
      SELECT 
        c.id, c.name, c.code, c.parent_id,
        (SELECT COUNT(*) FROM germplasm g WHERE g.classification_id = c.id) as germplasm_count,
        (SELECT COUNT(*) FROM traits t 
         INNER JOIN germplasm g ON t.germplasm_id = g.id 
         WHERE g.classification_id = c.id) as trait_count,
        (SELECT COUNT(*) FROM field_images fi 
         INNER JOIN germplasm g ON fi.germplasm_id = g.id 
         WHERE g.classification_id = c.id) as image_count,
        (SELECT COUNT(*) FROM classifications c2 WHERE c2.parent_id = c.id) as child_count
      FROM classifications c
      ORDER BY c.sort_order, c.id
    `).all();

    const traitCategoryStats = db.prepare(`
      SELECT 
        c.name as classification_name,
        t.trait_category,
        COUNT(*) as count
      FROM traits t
      INNER JOIN germplasm g ON t.germplasm_id = g.id
      INNER JOIN classifications c ON g.classification_id = c.id
      WHERE t.trait_category IS NOT NULL
      GROUP BY c.id, t.trait_category
      ORDER BY count DESC
    `).all();

    res.json({ 
      code: 200, 
      data: { 
        classification_stats: stats,
        trait_category_stats: traitCategoryStats 
      } 
    });
  } catch (err) {
    console.error('分类统计查询错误:', err);
    res.status(500).json({ code: 500, message: '查询失败: ' + err.message });
  }
});

router.get('/germplasm/quick-stats', (req, res) => {
  try {
    const db = getDb();

    const totalByStatus = db.prepare(`
      SELECT status, COUNT(*) as count FROM germplasm GROUP BY status
    `).all();

    const totalByMaterial = db.prepare(`
      SELECT material_type, COUNT(*) as count 
      FROM germplasm 
      WHERE material_type IS NOT NULL AND material_type != ''
      GROUP BY material_type
      ORDER BY count DESC
      LIMIT 10
    `).all();

    const totalByYear = db.prepare(`
      SELECT year_collected, COUNT(*) as count
      FROM germplasm
      WHERE year_collected IS NOT NULL
      GROUP BY year_collected
      ORDER BY year_collected DESC
      LIMIT 20
    `).all();

    const totalByConservation = db.prepare(`
      SELECT conservation_method, COUNT(*) as count
      FROM germplasm
      WHERE conservation_method IS NOT NULL AND conservation_method != ''
      GROUP BY conservation_method
      ORDER BY count DESC
    `).all();

    const recentActivity = db.prepare(`
      SELECT 
        'germplasm' as type,
        g.id, g.name, g.resource_no, g.created_at,
        NULL as trait_name, NULL as trait_value,
        NULL as filename, NULL as image_type
      FROM germplasm g
      UNION ALL
      SELECT 
        'trait' as type,
        g.id, g.name, g.resource_no, t.created_at,
        t.trait_name, t.trait_value,
        NULL, NULL
      FROM traits t
      INNER JOIN germplasm g ON t.germplasm_id = g.id
      UNION ALL
      SELECT 
        'image' as type,
        g.id, g.name, g.resource_no, fi.created_at,
        NULL, NULL,
        fi.filename, fi.image_type
      FROM field_images fi
      INNER JOIN germplasm g ON fi.germplasm_id = g.id
      ORDER BY created_at DESC
      LIMIT 30
    `).all();

    res.json({ 
      code: 200, 
      data: { 
        by_status: totalByStatus,
        by_material_type: totalByMaterial,
        by_year: totalByYear,
        by_conservation: totalByConservation,
        recent_activity: recentActivity
      } 
    });
  } catch (err) {
    console.error('快速统计查询错误:', err);
    res.status(500).json({ code: 500, message: '查询失败: ' + err.message });
  }
});

module.exports = router;
