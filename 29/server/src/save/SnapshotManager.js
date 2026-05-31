class TerrainSnapshot {
  constructor(terrain, config = {}, name = null) {
    this.id = 'snap_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    this.name = name || this.id;
    this.timestamp = Date.now();
    this.size = terrain.size;
    this.heightMap = this.compressHeightMap(terrain.heightMap);
    this.configSnapshot = JSON.parse(JSON.stringify(config));
    this.description = '';
    this.compressionRatio = 0;
  }

  compressHeightMap(heightMap) {
    const size = heightMap.length;
    const originalSize = size * size * 8;
    const compressed = [];
    
    for (let y = 0; y < size; y++) {
      const row = [];
      let prevValue = null;
      let runLength = 0;
      
      for (let x = 0; x < size; x++) {
        const value = Math.round(heightMap[y][x] * 100) / 100;
        
        if (prevValue === null) {
          prevValue = value;
          runLength = 1;
        } else if (value === prevValue && runLength < 255) {
          runLength++;
        } else {
          row.push([runLength, prevValue]);
          prevValue = value;
          runLength = 1;
        }
      }
      
      if (runLength > 0) {
        row.push([runLength, prevValue]);
      }
      
      compressed.push(row);
    }
    
    const compressedSize = JSON.stringify(compressed).length;
    this.compressionRatio = (1 - compressedSize / originalSize).toFixed(2);
    
    return compressed;
  }

  decompressHeightMap() {
    const size = this.size;
    const heightMap = [];
    
    for (let y = 0; y < size; y++) {
      const row = new Array(size);
      let pos = 0;
      
      for (const [runLength, value] of this.heightMap[y]) {
        for (let i = 0; i < runLength && pos < size; i++) {
          row[pos + i] = value;
        }
        pos += runLength;
      }
      
      heightMap[y] = row;
    }
    
    return heightMap;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      timestamp: this.timestamp,
      size: this.size,
      heightMap: this.heightMap,
      config: this.configSnapshot,
      description: this.description,
      compressionRatio: this.compressionRatio
    };
  }

  static fromJSON(data) {
    const snapshot = Object.create(TerrainSnapshot.prototype);
    snapshot.id = data.id;
    snapshot.name = data.name;
    snapshot.timestamp = data.timestamp;
    snapshot.size = data.size;
    snapshot.heightMap = data.heightMap;
    snapshot.configSnapshot = data.config;
    snapshot.description = data.description || '';
    snapshot.compressionRatio = data.compressionRatio || 0;
    return snapshot;
  }
}

class SnapshotManager {
  constructor(terrain, maxSnapshots = 20) {
    this.terrain = terrain;
    this.snapshots = [];
    this.maxSnapshots = maxSnapshots;
    this.autoSnapshotInterval = null;
    this.autoSnapshotEnabled = false;
    this.autoSnapshotFrequency = 60000;
  }

  createSnapshot(name = null, description = '') {
    try {
      const snapshot = new TerrainSnapshot(this.terrain, {}, name);
      snapshot.description = description;
      
      this.snapshots.unshift(snapshot);
      
      while (this.snapshots.length > this.maxSnapshots) {
        this.snapshots.pop();
      }
      
      return snapshot;
    } catch (error) {
      console.error('Failed to create snapshot:', error);
      return null;
    }
  }

  restoreSnapshot(snapshotId) {
    const snapshot = this.snapshots.find(s => s.id === snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    try {
      const heightMap = snapshot.decompressHeightMap();
      
      const size = snapshot.size;
      if (size !== this.terrain.size) {
        throw new Error(`Terrain size mismatch: expected ${this.terrain.size}, got ${size}`);
      }
      
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const height = heightMap[y][x];
          if (Number.isFinite(height) && height >= 0) {
            this.terrain.setHeight(x, y, height);
          }
        }
      }
      
      return {
        success: true,
        snapshot: snapshot,
        changedCells: this.getAllCellKeys(size)
      };
    } catch (error) {
      console.error('Failed to restore snapshot:', error);
      throw error;
    }
  }

  getAllCellKeys(size) {
    const keys = new Set();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        keys.add(`${x},${y}`);
      }
    }
    return keys;
  }

  deleteSnapshot(snapshotId) {
    const index = this.snapshots.findIndex(s => s.id === snapshotId);
    if (index > -1) {
      this.snapshots.splice(index, 1);
      return true;
    }
    return false;
  }

  getSnapshot(snapshotId) {
    return this.snapshots.find(s => s.id === snapshotId) || null;
  }

  listSnapshots() {
    return this.snapshots.map(s => ({
      id: s.id,
      name: s.name,
      timestamp: s.timestamp,
      time: new Date(s.timestamp).toLocaleString(),
      size: s.size,
      description: s.description,
      compressionRatio: s.compressionRatio
    }));
  }

  clearSnapshots() {
    this.snapshots = [];
  }

  compareSnapshots(snapshotId1, snapshotId2) {
    const snap1 = this.snapshots.find(s => s.id === snapshotId1);
    const snap2 = this.snapshots.find(s => s.id === snapshotId2);
    
    if (!snap1 || !snap2) {
      return null;
    }

    if (snap1.size !== snap2.size) {
      return { error: 'Snapshot sizes do not match' };
    }

    const map1 = snap1.decompressHeightMap();
    const map2 = snap2.decompressHeightMap();
    const size = snap1.size;
    
    let totalDiff = 0;
    let changedCells = 0;
    let maxDiff = 0;
    let minDiff = Infinity;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const diff = Math.abs(map1[y][x] - map2[y][x]);
        if (diff > 0.01) {
          totalDiff += diff;
          changedCells++;
          maxDiff = Math.max(maxDiff, diff);
          minDiff = Math.min(minDiff, diff);
        }
      }
    }

    return {
      snapshot1: snap1.name,
      snapshot2: snap2.name,
      timeDifference: Math.abs(snap2.timestamp - snap1.timestamp),
      changedCells,
      totalDifference: totalDiff,
      averageDifference: changedCells > 0 ? totalDiff / changedCells : 0,
      maxDifference: maxDiff,
      minDifference: minDiff === Infinity ? 0 : minDiff,
      changePercentage: (changedCells / (size * size) * 100).toFixed(2)
    };
  }

  exportSnapshot(snapshotId) {
    const snapshot = this.snapshots.find(s => s.id === snapshotId);
    if (!snapshot) {
      return null;
    }
    return JSON.stringify(snapshot.toJSON());
  }

  importSnapshot(jsonData) {
    try {
      const data = JSON.parse(jsonData);
      const snapshot = TerrainSnapshot.fromJSON(data);
      
      if (snapshot.size !== this.terrain.size) {
        throw new Error(`Terrain size mismatch: current ${this.terrain.size}, imported ${snapshot.size}`);
      }
      
      this.snapshots.unshift(snapshot);
      while (this.snapshots.length > this.maxSnapshots) {
        this.snapshots.pop();
      }
      
      return snapshot;
    } catch (error) {
      console.error('Failed to import snapshot:', error);
      throw error;
    }
  }

  enableAutoSnapshot(interval = 60000) {
    this.disableAutoSnapshot();
    this.autoSnapshotFrequency = Math.max(10000, interval);
    this.autoSnapshotEnabled = true;
    
    this.autoSnapshotInterval = setInterval(() => {
      if (this.autoSnapshotEnabled) {
        this.createSnapshot(`Auto_${new Date().toLocaleTimeString()}`, 'Auto snapshot');
      }
    }, this.autoSnapshotFrequency);
  }

  disableAutoSnapshot() {
    this.autoSnapshotEnabled = false;
    if (this.autoSnapshotInterval) {
      clearInterval(this.autoSnapshotInterval);
      this.autoSnapshotInterval = null;
    }
  }

  setMaxSnapshots(max) {
    this.maxSnapshots = Math.max(1, max);
    while (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.pop();
    }
  }

  getStats() {
    let totalSize = 0;
    for (const snap of this.snapshots) {
      totalSize += JSON.stringify(snap.heightMap).length;
    }
    
    return {
      snapshotCount: this.snapshots.length,
      maxSnapshots: this.maxSnapshots,
      totalSizeBytes: totalSize,
      totalSizeKB: (totalSize / 1024).toFixed(2),
      autoSnapshotEnabled: this.autoSnapshotEnabled,
      autoSnapshotFrequency: this.autoSnapshotFrequency
    };
  }
}

module.exports = {
  TerrainSnapshot,
  SnapshotManager
};
