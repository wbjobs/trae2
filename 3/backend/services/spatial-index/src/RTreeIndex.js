const rbush = require('rbush');

class RTreeIndex {
  constructor(maxEntries = 9) {
    this.tree = rbush(maxEntries);
    this.itemMap = new Map();
    this._idCounter = 0;
  }

  _generateId() {
    return `idx_${++this._idCounter}`;
  }

  insert(item) {
    const id = item.id || this._generateId();
    const indexedItem = {
      minX: item.bounds.minX,
      minY: item.bounds.minY,
      maxX: item.bounds.maxX,
      maxY: item.bounds.maxY,
      minZ: item.bounds.minZ || 0,
      maxZ: item.bounds.maxZ || 0,
      id,
      data: item.data || item
    };
    
    this.tree.insert(indexedItem);
    this.itemMap.set(id, indexedItem);
    return id;
  }

  insertBulk(items) {
    const indexedItems = items.map(item => {
      const id = item.id || this._generateId();
      const indexedItem = {
        minX: item.bounds.minX,
        minY: item.bounds.minY,
        maxX: item.bounds.maxX,
        maxY: item.bounds.maxY,
        minZ: item.bounds.minZ || 0,
        maxZ: item.bounds.maxZ || 0,
        id,
        data: item.data || item
      };
      this.itemMap.set(id, indexedItem);
      return indexedItem;
    });
    
    this.tree.load(indexedItems);
    return indexedItems.map(i => i.id);
  }

  search(bounds) {
    const results = this.tree.search({
      minX: bounds.minX,
      minY: bounds.minY,
      maxX: bounds.maxX,
      maxY: bounds.maxY
    });
    
    if (bounds.minZ !== undefined && bounds.maxZ !== undefined) {
      return results.filter(item => 
        item.maxZ >= bounds.minZ && item.minZ <= bounds.maxZ
      );
    }
    
    return results;
  }

  searchByPoint(x, y, z = 0, tolerance = 1) {
    return this.search({
      minX: x - tolerance,
      minY: y - tolerance,
      minZ: z - tolerance,
      maxX: x + tolerance,
      maxY: y + tolerance,
      maxZ: z + tolerance
    });
  }

  searchByRadius(centerX, centerY, centerZ, radius) {
    const results = this.search({
      minX: centerX - radius,
      minY: centerY - radius,
      minZ: centerZ - radius,
      maxX: centerX + radius,
      maxY: centerY + radius,
      maxZ: centerZ + radius
    });
    
    return results.filter(item => {
      const cx = (item.minX + item.maxX) / 2;
      const cy = (item.minY + item.maxY) / 2;
      const cz = (item.minZ + item.maxZ) / 2;
      const distance = Math.sqrt(
        Math.pow(cx - centerX, 2) + 
        Math.pow(cy - centerY, 2) + 
        Math.pow(cz - centerZ, 2)
      );
      return distance <= radius;
    });
  }

  remove(item) {
    const id = typeof item === 'string' ? item : item.id;
    const indexedItem = this.itemMap.get(id);
    
    if (indexedItem) {
      this.tree.remove(indexedItem);
      this.itemMap.delete(id);
      return true;
    }
    return false;
  }

  clear() {
    this.tree.clear();
    this.itemMap.clear();
    this._idCounter = 0;
  }

  all() {
    return this.tree.all();
  }

  get size() {
    return this.itemMap.size;
  }

  getBounds() {
    return this.tree.toJSON().bbox;
  }

  getById(id) {
    return this.itemMap.get(id);
  }
}

module.exports = RTreeIndex;
