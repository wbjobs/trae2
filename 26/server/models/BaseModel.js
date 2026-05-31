const db = require('../config/simpleDatabase');
const crypto = require('crypto');

class BaseModel {
  constructor(name) {
    this.name = name;
  }

  getAll() {
    return db.data[this.name] || [];
  }

  findAll(options = {}) {
    let data = [...this.getAll()];

    if (options.where) {
      data = data.filter(item => {
        return Object.entries(options.where).every(([key, value]) => {
          if (typeof value === 'object' && value !== null) {
            if (value['%']) {
              return item[key]?.includes(value['%'].replace(/%/g, ''));
            }
            if (value[Op.like]) {
              const pattern = value[Op.like].replace(/%/g, '');
              return item[key]?.includes(pattern);
            }
            if (value[Op.in]) {
              return value[Op.in].includes(item[key]);
            }
          }
          return item[key] === value;
        });
      });
    }

    if (options.order) {
      const [field, direction] = options.order[0];
      data.sort((a, b) => {
        const aVal = a[field];
        const bVal = b[field];
        if (aVal < bVal) return direction === 'DESC' ? 1 : -1;
        if (aVal > bVal) return direction === 'DESC' ? -1 : 1;
        return 0;
      });
    }

    if (options.limit) {
      const offset = options.offset || 0;
      data = data.slice(offset, offset + options.limit);
    }

    return data;
  }

  findAndCountAll(options = {}) {
    const all = this.findAll({ ...options, limit: undefined, offset: undefined });
    const rows = this.findAll(options);
    return { count: all.length, rows };
  }

  findByPk(id) {
    return this.getAll().find(item => item.id === parseInt(id));
  }

  findOne(options = {}) {
    return this.findAll({ ...options, limit: 1 })[0];
  }

  create(data) {
    const items = this.getAll();
    const id = items.length > 0 ? Math.max(...items.map(i => i.id)) + 1 : 1;
    const now = new Date().toISOString();
    const newItem = {
      id,
      ...data,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now
    };
    items.push(newItem);
    db.data[this.name] = items;
    db.save();
    return newItem;
  }

  bulkCreate(items) {
    const results = items.map(item => this.create(item));
    return results;
  }

  update(id, data) {
    const items = this.getAll();
    const index = items.findIndex(item => item.id === parseInt(id));
    if (index === -1) return null;
    items[index] = { ...items[index], ...data, updatedAt: new Date().toISOString() };
    db.data[this.name] = items;
    db.save();
    return items[index];
  }

  destroy(id) {
    const items = this.getAll().filter(item => item.id !== parseInt(id));
    db.data[this.name] = items;
    db.save();
    return true;
  }

  sum(field) {
    const items = this.getAll();
    return items.reduce((sum, item) => sum + (parseFloat(item[field]) || 0), 0);
  }

  count(options = {}) {
    return this.findAll(options).length;
  }
}

const Op = {
  like: Symbol('like'),
  in: Symbol('in'),
  or: Symbol('or')
};

const fn = {
  COUNT: (field) => ({ fn: 'COUNT', field }),
  SUM: (field) => ({ fn: 'SUM', field }),
  strftime: (format, field) => ({ fn: 'strftime', format, field })
};

const col = (name) => ({ col: name });

module.exports = { BaseModel, Op, fn, col };
