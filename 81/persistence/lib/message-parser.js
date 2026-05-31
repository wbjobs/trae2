const EventEmitter = require('events');

class MessageParser extends EventEmitter {
  constructor(redisClient, mysqlPool) {
    super();
    this.redisClient = redisClient;
    this.mysqlPool = mysqlPool;
    this.formats = new Map();
    this.activeFormats = new Map();
    this.cacheKey = 'config:message_formats';
    this.cacheTTL = 300;
  }

  async loadFormats() {
    try {
      const cached = await this.redisClient.get(this.cacheKey);
      if (cached) {
        const formats = JSON.parse(cached);
        this.formats.clear();
        this.activeFormats.clear();
        formats.forEach(f => {
          this.formats.set(f.format_name, f);
          if (f.is_active) {
            this.activeFormats.set(f.format_name, f);
          }
        });
        return;
      }

      const [rows] = await this.mysqlPool.execute('SELECT * FROM message_formats');
      this.formats.clear();
      this.activeFormats.clear();
      
      rows.forEach(row => {
        const format = {
          id: row.id,
          formatName: row.format_name,
          formatType: row.format_type,
          fieldMapping: typeof row.field_mapping === 'string' ? JSON.parse(row.field_mapping) : row.field_mapping,
          validationRules: row.validation_rules ? (typeof row.validation_rules === 'string' ? JSON.parse(row.validation_rules) : row.validation_rules) : {},
          transformRules: row.transform_rules ? (typeof row.transform_rules === 'string' ? JSON.parse(row.transform_rules) : row.transform_rules) : {},
          isActive: row.is_active === 1,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
        this.formats.set(format.formatName, format);
        if (format.isActive) {
          this.activeFormats.set(format.formatName, format);
        }
      });

      await this.redisClient.setEx(this.cacheKey, this.cacheTTL, JSON.stringify(rows));
      console.log(`已加载 ${this.formats.size} 个报文格式配置, 其中 ${this.activeFormats.size} 个激活`);
    } catch (error) {
      console.error('加载报文格式配置失败:', error);
      throw error;
    }
  }

  async createFormat(formatConfig) {
    const { formatName, formatType = 'json', fieldMapping, validationRules = {}, transformRules = {}, isActive = true } = formatConfig;

    if (!formatName || !fieldMapping) {
      throw new Error('缺少必填字段: formatName, fieldMapping');
    }

    const [result] = await this.mysqlPool.execute(
      `INSERT INTO message_formats (format_name, format_type, field_mapping, validation_rules, transform_rules, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [formatName, formatType, JSON.stringify(fieldMapping), JSON.stringify(validationRules), JSON.stringify(transformRules), isActive ? 1 : 0]
    );

    await this.invalidateCache();
    await this.loadFormats();

    return { id: result.insertId, formatName };
  }

  async updateFormat(formatName, updates) {
    const setClauses = [];
    const values = [];

    if (updates.formatType) { setClauses.push('format_type = ?'); values.push(updates.formatType); }
    if (updates.fieldMapping) { setClauses.push('field_mapping = ?'); values.push(JSON.stringify(updates.fieldMapping)); }
    if (updates.validationRules !== undefined) { setClauses.push('validation_rules = ?'); values.push(JSON.stringify(updates.validationRules)); }
    if (updates.transformRules !== undefined) { setClauses.push('transform_rules = ?'); values.push(JSON.stringify(updates.transformRules)); }
    if (updates.isActive !== undefined) { setClauses.push('is_active = ?'); values.push(updates.isActive ? 1 : 0); }

    if (setClauses.length === 0) {
      throw new Error('没有提供要更新的字段');
    }

    values.push(formatName);

    await this.mysqlPool.execute(
      `UPDATE message_formats SET ${setClauses.join(', ')} WHERE format_name = ?`,
      values
    );

    await this.invalidateCache();
    await this.loadFormats();
    this.emit('format:updated', { formatName, updates });
  }

  async deleteFormat(formatName) {
    await this.mysqlPool.execute('DELETE FROM message_formats WHERE format_name = ?', [formatName]);
    await this.invalidateCache();
    await this.loadFormats();
    this.emit('format:deleted', { formatName });
  }

  async invalidateCache() {
    await this.redisClient.del(this.cacheKey);
  }

  getFormat(formatName) {
    return this.formats.get(formatName);
  }

  listFormats(onlyActive = false) {
    const map = onlyActive ? this.activeFormats : this.formats;
    return Array.from(map.values());
  }

  parse(rawMessage, formatName = 'default_heartbeat') {
    const format = this.activeFormats.get(formatName);
    if (!format) {
      throw new Error(`未找到激活的报文格式: ${formatName}`);
    }

    let parsedData;
    try {
      if (format.formatType === 'json') {
        parsedData = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;
      } else if (format.formatType === 'csv') {
        parsedData = this.parseCsv(rawMessage, format);
      } else if (format.formatType === 'xml') {
        parsedData = this.parseXml(rawMessage, format);
      } else {
        parsedData = rawMessage;
      }
    } catch (error) {
      throw new Error(`报文解析失败: ${error.message}`);
    }

    const mappedData = this.mapFields(parsedData, format);
    const validatedData = this.validate(mappedData, format);
    const transformedData = this.transform(validatedData, format);

    return transformedData;
  }

  parseCsv(rawMessage, format) {
    const rules = format.validationRules || {};
    const delimiter = rules.delimiter || ',';
    const lines = rawMessage.trim().split('\n');
    let startIndex = rules.hasHeader ? 1 : 0;
    
    const headers = rules.hasHeader 
      ? lines[0].split(delimiter).map(h => h.trim())
      : (format.fieldMapping || []);

    const results = [];
    for (let i = startIndex; i < lines.length; i++) {
      const values = lines[i].split(delimiter).map(v => v.trim());
      const obj = {};
      headers.forEach((header, idx) => {
        obj[header] = values[idx];
      });
      results.push(obj);
    }

    return results.length === 1 ? results[0] : results;
  }

  parseXml(rawMessage, format) {
    const result = {};
    const regex = /<(\w+)>([^<]+)<\/\1>/g;
    let match;
    while ((match = regex.exec(rawMessage)) !== null) {
      result[match[1]] = match[2];
    }
    return result;
  }

  mapFields(parsedData, format) {
    const mapping = format.fieldMapping || {};
    const result = {};

    if (format.formatType === 'csv' && Array.isArray(mapping)) {
      return parsedData;
    }

    if (typeof mapping === 'object' && mapping !== null) {
      for (const [sourceField, targetField] of Object.entries(mapping)) {
        if (parsedData[sourceField] !== undefined) {
          result[targetField] = parsedData[sourceField];
        }
      }
    }

    for (const [key, value] of Object.entries(parsedData)) {
      if (result[key] === undefined) {
        result[key] = value;
      }
    }

    return result;
  }

  validate(data, format) {
    const rules = format.validationRules || {};

    if (rules.required) {
      for (const field of rules.required) {
        if (data[field] === undefined || data[field] === null || data[field] === '') {
          throw new Error(`必填字段缺失: ${field}`);
        }
      }
    }

    for (const [field, constraints] of Object.entries(rules)) {
      if (field === 'required') continue;
      if (data[field] === undefined) continue;

      const value = data[field];

      if (constraints.min !== undefined && Number(value) < constraints.min) {
        throw new Error(`字段 ${field} 小于最小值 ${constraints.min}`);
      }
      if (constraints.max !== undefined && Number(value) > constraints.max) {
        throw new Error(`字段 ${field} 大于最大值 ${constraints.max}`);
      }
      if (constraints.pattern && !new RegExp(constraints.pattern).test(String(value))) {
        throw new Error(`字段 ${field} 格式不匹配`);
      }
    }

    return data;
  }

  transform(data, format) {
    const rules = format.transformRules || {};
    const result = { ...data };

    for (const [field, rule] of Object.entries(rules)) {
      if (result[field] === undefined) continue;

      if (typeof rule === 'object' && !Array.isArray(rule)) {
        if (rule[result[field]] !== undefined) {
          result[field] = rule[result[field]];
        }
      } else if (typeof rule === 'string') {
        if (rule === 'toFixed(2)' && !isNaN(parseFloat(result[field]))) {
          result[field] = parseFloat(parseFloat(result[field]).toFixed(2));
        } else if (rule === 'toInt') {
          result[field] = parseInt(result[field]);
        } else if (rule === 'toFloat') {
          result[field] = parseFloat(result[field]);
        } else if (rule === 'toLowerCase') {
          result[field] = String(result[field]).toLowerCase();
        } else if (rule === 'toUpperCase') {
          result[field] = String(result[field]).toUpperCase();
        }
      }
    }

    return result;
  }

  parseBatch(messages, formatName) {
    if (!Array.isArray(messages)) {
      messages = [messages];
    }

    const results = {
      success: [],
      failed: [],
      errors: []
    };

    for (let i = 0; i < messages.length; i++) {
      try {
        const parsed = this.parse(messages[i], formatName);
        if (Array.isArray(parsed)) {
          results.success.push(...parsed);
        } else {
          results.success.push(parsed);
        }
      } catch (error) {
        results.failed.push({ index: i, message: messages[i], error: error.message });
        results.errors.push(`第${i}条: ${error.message}`);
      }
    }

    return results;
  }
}

module.exports = MessageParser;
