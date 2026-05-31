class QueryCache {
  constructor(options = {}) {
    this.cache = new Map();
    this.ttl = options.ttl || 5 * 60 * 1000;
    this.maxSize = options.maxSize || 1000;
  }

  generateKey(modelName, method, options) {
    return `${modelName}:${method}:${JSON.stringify(options)}`;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }

  set(key, data) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, {
      data,
      expiry: Date.now() + this.ttl
    });
  }

  invalidate(modelName) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${modelName}:`)) {
        this.cache.delete(key);
      }
    }
  }

  clear() {
    this.cache.clear();
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl
    };
  }
}

const queryCache = new QueryCache({ ttl: 60 * 1000, maxSize: 500 });

const withCache = (modelName, method) => {
  return async (originalFn, options) => {
    const key = queryCache.generateKey(modelName, method, options);
    const cached = queryCache.get(key);
    if (cached) {
      return cached;
    }
    const result = originalFn();
    queryCache.set(key, result);
    return result;
  };
};

class QueryOptimizer {
  static optimizeFindAll(data, options = {}) {
    const { where, order, limit, offset, attributes } = options;
    let result = [...data];

    if (where && Object.keys(where).length > 0) {
      result = result.filter(item => {
        return Object.entries(where).every(([key, value]) => {
          if (typeof value === 'object') {
            if (value.$like) {
              const pattern = value.$like.replace(/%/g, '.*');
              return new RegExp(pattern, 'i').test(item[key]);
            }
            if (value.$in) {
              return value.$in.includes(item[key]);
            }
            if (value.$gte) {
              return item[key] >= value.$gte;
            }
            if (value.$lte) {
              return item[key] <= value.$lte;
            }
          }
          return item[key] == value;
        });
      });
    }

    if (order && order.length > 0) {
      result.sort((a, b) => {
        for (const [field, direction] of order) {
          const aVal = a[field];
          const bVal = b[field];
          if (aVal !== bVal) {
            const compare = aVal > bVal ? 1 : -1;
            return direction === 'DESC' ? -compare : compare;
          }
        }
        return 0;
      });
    }

    const total = result.length;

    if (offset !== undefined) {
      result = result.slice(parseInt(offset));
    }
    if (limit !== undefined) {
      result = result.slice(0, parseInt(limit));
    }

    if (attributes && attributes.length > 0) {
      result = result.map(item => {
        const filtered = {};
        attributes.forEach(attr => {
          filtered[attr] = item[attr];
        });
        return filtered;
      });
    }

    return { rows: result, count: total };
  }

  static findByIndexedField(data, field, value) {
    const index = this.indexes?.[field];
    if (index && index.has(value)) {
      return index.get(value);
    }
    return data.find(item => item[field] == value);
  }

  static buildIndex(data, field) {
    const index = new Map();
    data.forEach(item => {
      const key = item[field];
      if (!index.has(key)) {
        index.set(key, []);
      }
      index.get(key).push(item);
    });
    if (!this.indexes) this.indexes = {};
    this.indexes[field] = index;
    return index;
  }

  static lazyLoad(data, ids, relationKey, relationData) {
    const relationMap = new Map();
    relationData.forEach(item => {
      const key = item[relationKey];
      if (!relationMap.has(key)) {
        relationMap.set(key, []);
      }
      relationMap.get(key).push(item);
    });

    return data.map(item => ({
      ...item,
      [relationKey + 'Data']: relationMap.get(item.id) || []
    }));
  }
}

module.exports = {
  QueryCache,
  queryCache,
  withCache,
  QueryOptimizer
};
