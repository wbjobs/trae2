const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const LAYERS = [
  { id: 'terrain', name: '地形点云', color: null, hasColor: true },
  { id: 'buildings', name: '建筑点云', color: null, hasColor: true },
  { id: 'vegetation', name: '植被点云', color: [0, 200, 0], hasColor: true }
];
const LOD_LEVELS = [0, 1, 2, 3];
const TILE_SIZE_BASE = 100;
const GRID_SIZE = 20;

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function generateTileData(layerId, x, y, z, lod) {
  const tileSize = TILE_SIZE_BASE * Math.pow(2, lod);
  const pointsPerTile = Math.max(500, 5000 - lod * 800);
  
  const points = [];
  const colors = [];
  const normals = [];
  const intensities = [];
  
  const baseX = x * tileSize;
  const baseY = y * tileSize;
  const baseZ = z * tileSize;
  
  for (let i = 0; i < pointsPerTile; i++) {
    let px = baseX + Math.random() * tileSize;
    let py = baseY + Math.random() * tileSize;
    let pz, r, g, b;
    
    switch (layerId) {
      case 'terrain':
        pz = baseZ + Math.sin(px * 0.02) * Math.cos(py * 0.02) * 20 + Math.random() * 5;
        const heightNorm = (pz + 50) / 100;
        r = 0.3 + heightNorm * 0.3 + Math.random() * 0.1;
        g = 0.2 + heightNorm * 0.4 + Math.random() * 0.1;
        b = 0.1 + heightNorm * 0.2 + Math.random() * 0.1;
        break;
        
      case 'buildings':
        const inBuilding = Math.random() < 0.3;
        if (inBuilding) {
          const bx = Math.floor(px / 40) * 40 + 20;
          const by = Math.floor(py / 40) * 40 + 20;
          px = bx + (Math.random() - 0.5) * 15;
          py = by + (Math.random() - 0.5) * 15;
          pz = baseZ + Math.random() * 80;
          r = 0.6 + Math.random() * 0.3;
          g = 0.6 + Math.random() * 0.3;
          b = 0.6 + Math.random() * 0.3;
        } else {
          continue;
        }
        break;
        
      case 'vegetation':
        const inVegetation = Math.random() < 0.4;
        if (inVegetation) {
          pz = baseZ + Math.random() * 15;
          r = 0.1 + Math.random() * 0.2;
          g = 0.5 + Math.random() * 0.3;
          b = 0.1 + Math.random() * 0.2;
        } else {
          continue;
        }
        break;
        
      default:
        pz = baseZ + Math.random() * 50;
        r = Math.random();
        g = Math.random();
        b = Math.random();
    }
    
    points.push(px, py, pz);
    colors.push(r, g, b);
    
    const nx = (Math.random() - 0.5) * 2;
    const ny = (Math.random() - 0.5) * 2;
    const nz = 1;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    normals.push(nx / len, ny / len, nz / len);
    
    intensities.push(0.5 + Math.random() * 0.5);
  }
  
  return {
    x, y, z, lod,
    points,
    colors,
    normals,
    intensities,
    pointCount: points.length / 3,
    bounds: {
      minX: baseX,
      minY: baseY,
      minZ: baseZ,
      maxX: baseX + tileSize,
      maxY: baseY + tileSize,
      maxZ: baseZ + 100
    }
  };
}

function generateLayerInfo(layer) {
  return {
    id: layer.id,
    name: layer.name,
    bounds: {
      minX: -GRID_SIZE * TILE_SIZE_BASE / 2,
      minY: -GRID_SIZE * TILE_SIZE_BASE / 2,
      minZ: -100,
      maxX: GRID_SIZE * TILE_SIZE_BASE / 2,
      maxY: GRID_SIZE * TILE_SIZE_BASE / 2,
      maxZ: 200
    },
    pointCount: 0,
    maxLod: Math.max(...LOD_LEVELS),
    attributes: ['position', 'color', 'normal', 'intensity'],
    color: layer.color
  };
}

async function generateSampleData() {
  console.log('='.repeat(60));
  console.log('🎲 Generating Sample Point Cloud Data');
  console.log('='.repeat(60));
  
  ensureDir(DATA_DIR);
  
  let totalPoints = 0;
  let totalTiles = 0;
  
  for (const layer of LAYERS) {
    console.log(`\n📁 Processing layer: ${layer.name} (${layer.id})`);
    
    const layerDir = path.join(DATA_DIR, layer.id);
    ensureDir(layerDir);
    
    const layerInfo = generateLayerInfo(layer);
    fs.writeFileSync(
      path.join(layerDir, 'layer.json'),
      JSON.stringify(layerInfo, null, 2)
    );
    
    let layerPoints = 0;
    let layerTiles = 0;
    
    for (const lod of LOD_LEVELS) {
      const lodDir = path.join(layerDir, `lod_${lod}`);
      ensureDir(lodDir);
      
      const gridSize = Math.max(1, Math.floor(GRID_SIZE / Math.pow(2, lod)));
      const halfGrid = Math.floor(gridSize / 2);
      
      console.log(`  LOD ${lod}: generating ${gridSize}x${gridSize}x1 tiles...`);
      
      for (let x = -halfGrid; x < halfGrid; x++) {
        for (let y = -halfGrid; y < halfGrid; y++) {
          for (let z = 0; z < 1; z++) {
            const tileData = generateTileData(layer.id, x, y, z, lod);
            
            if (tileData.points.length > 0) {
              const tilePath = path.join(lodDir, `tile_${x}_${y}_${z}.json`);
              fs.writeFileSync(tilePath, JSON.stringify(tileData));
              
              layerPoints += tileData.pointCount;
              layerTiles++;
            }
          }
        }
      }
    }
    
    layerInfo.pointCount = layerPoints;
    fs.writeFileSync(
      path.join(layerDir, 'layer.json'),
      JSON.stringify(layerInfo, null, 2)
    );
    
    totalPoints += layerPoints;
    totalTiles += layerTiles;
    
    console.log(`  ✅ Layer complete: ${layerPoints.toLocaleString()} points, ${layerTiles} tiles`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Sample data generation complete!');
  console.log('='.repeat(60));
  console.log(`\n📊 Statistics:
  • Total layers: ${LAYERS.length}
  • Total tiles: ${totalTiles}
  • Total points: ${totalPoints.toLocaleString()}
  • Data directory: ${DATA_DIR}
`);
  console.log('='.repeat(60));
  
  return { totalPoints, totalTiles, layers: LAYERS };
}

if (require.main === module) {
  generateSampleData().catch(console.error);
}

module.exports = generateSampleData;
