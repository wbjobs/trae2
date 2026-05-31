const express = require('express');
const SpatialIndexService = require('./SpatialIndexService');

function createRoutes(serviceRegistry) {
  const router = express.Router();
  const spatialIndexService = new SpatialIndexService();

  router.get('/health', (req, res) => {
    res.json({
      service: 'spatial-index-service',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      stats: spatialIndexService.getAllStats()
    });
  });

  router.post('/index/tile/:layerId', async (req, res) => {
    try {
      const { layerId } = req.params;
      const tile = req.body;
      const id = await spatialIndexService.indexTile(layerId, tile);
      
      res.json({
        success: true,
        data: { id }
      });
    } catch (error) {
      console.error('Index tile error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.post('/index/tiles/:layerId', async (req, res) => {
    try {
      const { layerId } = req.params;
      const tiles = req.body;
      const ids = await spatialIndexService.indexTilesBulk(layerId, tiles);
      
      res.json({
        success: true,
        data: { ids, count: ids.length }
      });
    } catch (error) {
      console.error('Index tiles error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.post('/query/bounds/:layerId', (req, res) => {
    try {
      const { layerId } = req.params;
      const bounds = req.body;
      const results = spatialIndexService.queryByBounds(layerId, bounds);
      
      res.json({
        success: true,
        count: results.length,
        data: results
      });
    } catch (error) {
      console.error('Query bounds error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.post('/query/point/:layerId', (req, res) => {
    try {
      const { layerId } = req.params;
      const { x, y, z, tolerance } = req.body;
      const results = spatialIndexService.queryByPoint(
        layerId, x, y, z || 0, tolerance || 1
      );
      
      res.json({
        success: true,
        count: results.length,
        data: results
      });
    } catch (error) {
      console.error('Query point error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.post('/query/radius/:layerId', (req, res) => {
    try {
      const { layerId } = req.params;
      const { centerX, centerY, centerZ, radius } = req.body;
      const results = spatialIndexService.queryByRadius(
        layerId, centerX, centerY, centerZ || 0, radius
      );
      
      res.json({
        success: true,
        count: results.length,
        data: results
      });
    } catch (error) {
      console.error('Query radius error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.post('/query/view/:layerId', (req, res) => {
    try {
      const { layerId } = req.params;
      const { viewBounds, lodLevel } = req.body;
      const results = spatialIndexService.queryForView(
        layerId, viewBounds, lodLevel
      );
      
      res.json({
        success: true,
        count: results.length,
        data: results
      });
    } catch (error) {
      console.error('Query view error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.post('/query/multi', (req, res) => {
    try {
      const { layerIds, bounds } = req.body;
      const results = spatialIndexService.queryMultipleLayers(layerIds, bounds);
      
      const count = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);
      res.json({
        success: true,
        count,
        data: results
      });
    } catch (error) {
      console.error('Query multi error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.delete('/index/:layerId', (req, res) => {
    try {
      const { layerId } = req.params;
      const cleared = spatialIndexService.clearIndex(layerId);
      
      res.json({
        success: true,
        cleared
      });
    } catch (error) {
      console.error('Clear index error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.delete('/index', (req, res) => {
    try {
      spatialIndexService.clearAllIndices();
      res.json({
        success: true,
        message: 'All indices cleared'
      });
    } catch (error) {
      console.error('Clear all indices error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.get('/stats/:layerId', (req, res) => {
    try {
      const { layerId } = req.params;
      const stats = spatialIndexService.getIndexStats(layerId);
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.get('/stats', (req, res) => {
    try {
      const stats = spatialIndexService.getAllStats();
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('All stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.get('/layers', (req, res) => {
    try {
      const layers = spatialIndexService.getLayers();
      res.json({
        success: true,
        data: layers
      });
    } catch (error) {
      console.error('Get layers error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.get('/layers/:layerId', (req, res) => {
    try {
      const { layerId } = req.params;
      const layer = spatialIndexService.getLayer(layerId);
      
      res.json({
        success: true,
        data: layer
      });
    } catch (error) {
      console.error('Get layer error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.put('/layers/:layerId', (req, res) => {
    try {
      const { layerId } = req.params;
      const updates = req.body;
      const layer = spatialIndexService.updateLayer(layerId, updates);
      
      res.json({
        success: true,
        data: layer
      });
    } catch (error) {
      console.error('Update layer error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.post('/layers', (req, res) => {
    try {
      const layerConfig = req.body;
      const layer = spatialIndexService.addLayer(layerConfig);
      
      res.json({
        success: true,
        data: layer
      });
    } catch (error) {
      console.error('Add layer error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.delete('/layers/:layerId', (req, res) => {
    try {
      const { layerId } = req.params;
      const deleted = spatialIndexService.removeLayer(layerId);
      
      res.json({
        success: true,
        deleted
      });
    } catch (error) {
      console.error('Delete layer error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.get('/synchronize/:layerId', async (req, res) => {
    try {
      const { layerId } = req.params;
      const tileService = serviceRegistry.getService('tile-service');
      
      if (tileService) {
        const response = await fetch(`${tileService.url}/api/layer/${layerId}`);
        const layerData = await response.json();
        
        if (layerData.success && layerData.data) {
          spatialIndexService.updateLayer(layerId, layerData.data);
        }
      }
      
      res.json({
        success: true,
        message: `Layer ${layerId} synchronized`
      });
    } catch (error) {
      console.error('Synchronize error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = createRoutes;
