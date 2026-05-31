const express = require('express');
const TileLoader = require('./TileLoader');

function createRoutes(serviceRegistry) {
  const router = express.Router();
  const tileLoader = new TileLoader();

  router.get('/health', (req, res) => {
    res.json({
      service: 'tile-service',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      cacheSize: tileLoader.tileCache.size
    });
  });

  router.get('/tile/:layerId/:lod/:x/:y/:z', async (req, res) => {
    try {
      const { layerId, lod, x, y, z } = req.params;
      const tile = await tileLoader.loadTile(
        layerId,
        parseInt(x),
        parseInt(y),
        parseInt(z),
        parseInt(lod)
      );
      
      res.json({
        success: true,
        data: tile
      });
    } catch (error) {
      console.error('Tile load error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.post('/tiles/bounds', async (req, res) => {
    try {
      const { layerId, bounds, lod } = req.body;
      const tiles = await tileLoader.loadTilesByBounds(layerId, bounds, lod);
      
      res.json({
        success: true,
        count: tiles.length,
        data: tiles
      });
    } catch (error) {
      console.error('Tiles by bounds error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.get('/layer/:layerId', async (req, res) => {
    try {
      const { layerId } = req.params;
      const info = await tileLoader.getLayerInfo(layerId);
      
      res.json({
        success: true,
        data: info
      });
    } catch (error) {
      console.error('Layer info error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.get('/layers', async (req, res) => {
    try {
      const spatialIndexService = serviceRegistry.getService('spatial-index');
      if (spatialIndexService) {
        const response = await fetch(`${spatialIndexService.url}/api/layers`);
        const data = await response.json();
        return res.json(data);
      }
      
      res.json({
        success: true,
        data: [
          { id: 'terrain', name: '地形点云', visible: true },
          { id: 'buildings', name: '建筑点云', visible: true },
          { id: 'vegetation', name: '植被点云', visible: true }
        ]
      });
    } catch (error) {
      console.error('Layers list error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.get('/cache/clear', (req, res) => {
    tileLoader.clearCache();
    res.json({
      success: true,
      message: 'Tile cache cleared'
    });
  });

  router.get('/cache/stats', (req, res) => {
    res.json({
      success: true,
      data: {
        size: tileLoader.tileCache.size,
        maxSize: tileLoader.cacheSize
      }
    });
  });

  return router;
}

module.exports = createRoutes;
