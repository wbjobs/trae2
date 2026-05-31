const { EventEmitter } = require('events');
const { CONFIG, getEffectiveRules, saveRulesToDisk, loadRulesFromDisk } = require('./config');

class RuleFilter extends EventEmitter {
  constructor(logger, threadPool = null) {
    super();
    this.logger = logger;
    this.threadPool = threadPool;
    this.useThreadPool = !!threadPool;
    this.rules = [];
    this.rateLimitState = {};
    this.actionStats = {
      block: 0,
      allow: 0,
      rate_limit: 0,
      log: 0,
      monitor: 0,
      transform: 0,
    };
    this.blockedMessages = [];
    this.maxBlockedSize = 2000;
    this._loadRules();
  }

  _loadRules() {
    this.rules = getEffectiveRules();
    this.logger.info('Filter', `Loaded ${this.rules.length} filtering rules`);
  }

  reloadRules() {
    this._loadRules();
    this.emit('rulesUpdated', this.rules);
    this.logger.audit('Filter', 'Filtering rules reloaded', { count: this.rules.length });
  }

  addRule(rule) {
    const newRule = {
      ...rule,
      id: rule.id || 'rule-' + Date.now(),
      createdAt: new Date().toISOString(),
      enabled: rule.enabled !== false,
      priority: rule.priority || 50,
    };
    if (!CONFIG.filter.actions.includes(newRule.action)) {
      throw new Error(`Invalid action: ${newRule.action}`);
    }
    const custom = loadRulesFromDisk();
    custom.push(newRule);
    saveRulesToDisk(custom);
    this._loadRules();
    this.emit('ruleAdded', newRule);
    this.logger.audit('Filter', 'New filter rule added', { ruleId: newRule.id, name: newRule.name });
    return newRule;
  }

  updateRule(ruleId, updates) {
    const custom = loadRulesFromDisk();
    const idx = custom.findIndex(r => r.id === ruleId);
    if (idx === -1) {
      const defaultIdx = this.rules.findIndex(r => r.id === ruleId);
      if (defaultIdx === -1) return null;
      const updated = { ...this.rules[defaultIdx], ...updates, updatedAt: new Date().toISOString() };
      custom.push(updated);
      saveRulesToDisk(custom);
      this._loadRules();
      this.emit('ruleUpdated', updated);
      this.logger.audit('Filter', 'Filter rule updated', { ruleId, updates });
      return updated;
    }
    custom[idx] = { ...custom[idx], ...updates, updatedAt: new Date().toISOString() };
    saveRulesToDisk(custom);
    this._loadRules();
    this.emit('ruleUpdated', custom[idx]);
    this.logger.audit('Filter', 'Filter rule updated', { ruleId, updates });
    return custom[idx];
  }

  deleteRule(ruleId) {
    const custom = loadRulesFromDisk();
    const idx = custom.findIndex(r => r.id === ruleId);
    if (idx === -1) return false;
    custom.splice(idx, 1);
    saveRulesToDisk(custom);
    this._loadRules();
    this.emit('ruleDeleted', ruleId);
    this.logger.audit('Filter', 'Filter rule deleted', { ruleId });
    return true;
  }

  toggleRule(ruleId, enabled) {
    return this.updateRule(ruleId, { enabled });
  }

  exportRules(format = 'json') {
    const rules = this.rules.filter(r => !r.isDefault);
    if (format === 'csv') {
      return this._rulesToCSV(rules);
    }
    return JSON.stringify(rules, null, 2);
  }

  importRules(rulesData, format = 'json') {
    let rules;
    if (format === 'csv') {
      rules = this._csvToRules(rulesData);
    } else {
      rules = Array.isArray(rulesData) ? rulesData : JSON.parse(rulesData);
    }
    let imported = 0;
    let errors = [];
    for (const rule of rules) {
      try {
        this.addRule(rule);
        imported++;
      } catch (e) {
        errors.push({ rule: rule.name || rule.id, error: e.message });
      }
    }
    return { imported, errors, total: rules.length };
  }

  deleteRules(ruleIds) {
    let deleted = 0;
    for (const id of ruleIds) {
      if (this.deleteRule(id)) deleted++;
    }
    return { deleted, total: ruleIds.length };
  }

  toggleRules(ruleIds, enabled) {
    let updated = 0;
    for (const id of ruleIds) {
      if (this.toggleRule(id, enabled)) updated++;
    }
    return { updated, total: ruleIds.length };
  }

  _rulesToCSV(rules) {
    const headers = ['id', 'name', 'description', 'action', 'priority', 'enabled', 'sid', 'sourceNodes', 'did', 'rateLimit'];
    const rows = rules.map(r => [
      r.id,
      '"' + (r.name || '').replace(/"/g, '""') + '"',
      '"' + (r.description || '').replace(/"/g, '""') + '"',
      r.action,
      r.priority,
      r.enabled,
      Array.isArray(r.conditions && r.conditions.sid) ? r.conditions.sid.join('|') : '',
      Array.isArray(r.conditions && r.conditions.sourceNodes) ? r.conditions.sourceNodes.join('|') : '',
      Array.isArray(r.conditions && r.conditions.did) ? r.conditions.did.join('|') : '',
      r.conditions && r.conditions.rateLimit ? JSON.stringify(r.conditions.rateLimit) : '',
    ].join(','));
    return [headers.join(','), ...rows].join('\n');
  }

  _csvToRules(csvString) {
    const lines = csvString.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',');
    const rules = [];
    for (let i = 1; i < lines.length; i++) {
      try {
        const values = this._parseCSVLine(lines[i]);
        if (values.length) {
          const rule = {
            name: values[1] ? values[1].replace(/^"|"$/g, '') : '',
            description: values[2] ? values[2].replace(/^"|"$/g, '') : '',
            action: values[3],
            priority: parseInt(values[4]),
            enabled: values[5] === 'true',
            conditions: {
              sid: values[6] ? values[6].split('|').filter(Boolean) : [],
              sourceNodes: values[7] ? values[7].split('|').filter(Boolean) : [],
              did: values[8] ? values[8].split('|').filter(Boolean) : [],
              rateLimit: values[9] ? JSON.parse(values[9]) : null,
            },
          };
          rules.push(rule);
        }
      } catch (e) {}
    }
    return rules;
  }

  _parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  _matchCondition(condition, message) {
    const { sid, sourceNodes, did, rateLimit } = condition;
    if (sid && sid.length > 0) {
      const sidArray = Array.isArray(sid) ? sid : [sid];
      if (!sidArray.includes(message.sid)) return false;
    }
    if (sourceNodes && sourceNodes.length > 0) {
      const nodesArray = Array.isArray(sourceNodes) ? sourceNodes : [sourceNodes];
      if (!nodesArray.includes(message.sourceNode)) return false;
    }
    if (did && did.length > 0 && message.did) {
      const didArray = Array.isArray(did) ? did : [did];
      if (!didArray.includes(message.did)) return false;
    }
    return true;
  }

  _checkRateLimit(ruleId, rateLimit) {
    const now = Date.now();
    const state = this.rateLimitState[ruleId] || { count: 0, windowStart: now };
    if (now - state.windowStart >= rateLimit.windowMs) {
      state.count = 0;
      state.windowStart = now;
    }
    state.count++;
    this.rateLimitState[ruleId] = state;
    return state.count <= rateLimit.max;
  }

  process(message) {
    const result = {
      message,
      actions: [],
      finalAction: 'allow',
      matchedRules: [],
      timestamp: new Date().toISOString(),
    };
    if (message.traceContext && message.traceContext.nodes) {
      message.traceContext.nodes.push({
        nodeId: CONFIG.cluster.nodeId,
        role: 'filter',
        timestamp: Date.now(),
      });
    }
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      if (this._matchCondition(rule.conditions, message)) {
        result.matchedRules.push({ id: rule.id, name: rule.name, priority: rule.priority, action: rule.action });
        result.actions.push(rule.action);
        this.actionStats[rule.action] = (this.actionStats[rule.action] || 0) + 1;
        if (message.traceContext) {
          message.traceContext.filters.push({
            ruleId: rule.id,
            ruleName: rule.name,
            action: rule.action,
            timestamp: Date.now(),
          });
        }
        if (rule.action === 'block') {
          result.finalAction = 'block';
          this.blockedMessages.unshift({ message, rule, timestamp: new Date().toISOString() });
          if (this.blockedMessages.length > this.maxBlockedSize) {
            this.blockedMessages.pop();
          }
          this.logger.audit('Filter', `Message BLOCKED by rule: ${rule.name}`, {
            ruleId: rule.id,
            messageId: message.id,
            sid: message.sid,
            did: message.did,
            traceId: message.traceId,
          });
          if (message.traceContext) message.traceContext.finalStatus = 'blocked';
          break;
        }
        if (rule.action === 'rate_limit') {
          if (rule.conditions.rateLimit) {
            const allowed = this._checkRateLimit(rule.id, rule.conditions.rateLimit);
            if (!allowed) {
              result.finalAction = 'block';
              result.rateLimited = true;
              this.logger.audit('Filter', `Message RATE LIMITED by rule: ${rule.name}`, {
                ruleId: rule.id,
                messageId: message.id,
                traceId: message.traceId,
              });
              if (message.traceContext) message.traceContext.finalStatus = 'rate_limited';
              break;
            }
          }
        }
        if (rule.action === 'log' || rule.action === 'monitor') {
          const level = rule.logLevel === 'high' ? 'audit' : (rule.logLevel === 'low' ? 'debug' : 'info');
          this.logger[level]('Filter', `Rule [${rule.name}] matched`, {
            messageId: message.id,
            sid: message.sid,
            sidName: message.sidName,
            did: message.did,
            traceId: message.traceId,
          });
        }
      }
    }
    if (result.finalAction !== 'block' && message.traceContext) {
      message.traceContext.finalStatus = 'forwarded';
      this.actionStats.allow = (this.actionStats.allow || 0) + 1;
    } else if (result.finalAction !== 'block') {
      this.actionStats.allow++;
    }
    this.emit('filterResult', result);
    return result;
  }

  getRules() {
    return this.rules;
  }

  getRule(id) {
    return this.rules.find(r => r.id === id);
  }

  getStats() {
    return {
      ruleCount: this.rules.length,
      enabledRules: this.rules.filter(r => r.enabled).length,
      actionStats: this.actionStats,
      blockedCount: this.blockedMessages.length,
    };
  }

  getBlockedMessages(limit = 50) {
    return this.blockedMessages.slice(0, limit);
  }

  clearBlocked() {
    this.blockedMessages = [];
  }
}

module.exports = RuleFilter;
