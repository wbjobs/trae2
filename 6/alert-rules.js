class AlertRule {
  constructor(name, config) {
    this.name = name;
    this.enabled = config.enabled !== false;
    this.type = config.type;
    this.condition = config.condition;
    this.severity = config.severity || 'info';
    this.description = config.description || '';
    this.messageTemplate = config.messageTemplate || null;
  }

  matches(event) {
    if (!this.enabled) return false;

    switch (this.type) {
      case 'eventName':
        return this._matchEventName(event);
      case 'address':
        return this._matchAddress(event);
      case 'amountThreshold':
        return this._matchAmountThreshold(event);
      case 'custom':
        return this._matchCustom(event);
      case 'contract':
        return this._matchContract(event);
      default:
        return false;
    }
  }

  _matchEventName(event) {
    const { eventNames, exclude } = this.condition;
    const name = event.eventName;

    if (exclude && exclude.includes(name)) {
      return false;
    }

    if (!eventNames || eventNames.length === 0) {
      return true;
    }

    return eventNames.includes(name);
  }

  _matchAddress(event) {
    const { fields, whitelist, blacklist } = this.condition;
    const values = this._getFieldValues(event, fields);

    for (const value of values) {
      if (!value) continue;
      const lowerValue = value.toLowerCase();

      if (blacklist && blacklist.some(addr => lowerValue === addr.toLowerCase())) {
        return true;
      }

      if (whitelist && whitelist.some(addr => lowerValue === addr.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  _matchAmountThreshold(event) {
    const { field, min, max, decimals = 18 } = this.condition;
    const value = this._getFieldValue(event, field);

    if (value === null || value === undefined) return false;

    let numericValue;
    if (typeof value === 'string') {
      numericValue = parseFloat(value);
    } else if (typeof value === 'bigint') {
      numericValue = Number(value) / Math.pow(10, decimals);
    } else if (typeof value === 'number') {
      numericValue = value;
    } else {
      return false;
    }

    if (min !== undefined && numericValue < min) return false;
    if (max !== undefined && numericValue > max) return false;

    return true;
  }

  _matchContract(event) {
    const { contracts } = this.condition;
    if (!contracts || contracts.length === 0) return true;

    const contractAddr = event.contractAddress?.toLowerCase();
    return contracts.some(c => c.toLowerCase() === contractAddr);
  }

  _matchCustom(event) {
    if (!this.condition || typeof this.condition.evaluate !== 'function') {
      return false;
    }

    try {
      return !!this.condition.evaluate(event);
    } catch (e) {
      console.error(`[AlertRules] Error evaluating custom rule "${this.name}":`, e.message);
      return false;
    }
  }

  _getFieldValues(event, fields) {
    const values = [];
    if (!fields) return values;

    for (const field of fields) {
      const value = this._getFieldValue(event, field);
      if (value) values.push(value);
    }

    return values;
  }

  _getFieldValue(event, fieldPath) {
    const parts = fieldPath.split('.');
    let current = event;

    for (const part of parts) {
      if (current === null || current === undefined) return null;
      current = current[part];
    }

    return current;
  }

  formatMessage(event) {
    if (!this.messageTemplate) return null;

    try {
      let msg = this.messageTemplate;
      msg = msg.replace(/{{eventName}}/g, event.eventName || '');
      msg = msg.replace(/{{contractAddress}}/g, event.contractAddress || '');
      msg = msg.replace(/{{blockNumber}}/g, event.blockNumber?.toString() || '');
      msg = msg.replace(/{{transactionHash}}/g, event.transactionHash || '');

      if (event.returnValues) {
        for (const [key, value] of Object.entries(event.returnValues)) {
          msg = msg.replace(new RegExp(`{{returnValues.${key}}}`, 'g'), String(value));
        }
      }

      return msg;
    } catch (e) {
      return this.messageTemplate;
    }
  }
}

class AlertRuleEngine {
  constructor() {
    this.rules = new Map();
  }

  addRule(name, config) {
    const rule = new AlertRule(name, config);
    this.rules.set(name, rule);
    console.log(`[AlertRules] Added rule: ${name} (type: ${config.type})`);
    return rule;
  }

  removeRule(name) {
    return this.rules.delete(name);
  }

  getRule(name) {
    return this.rules.get(name);
  }

  listRules() {
    return Array.from(this.rules.entries()).map(([name, rule]) => ({
      name,
      type: rule.type,
      enabled: rule.enabled,
      severity: rule.severity,
      description: rule.description,
    }));
  }

  evaluate(event) {
    const matchedRules = [];

    for (const [name, rule] of this.rules.entries()) {
      try {
        if (rule.matches(event)) {
          matchedRules.push({
            name,
            severity: rule.severity,
            description: rule.description,
            customMessage: rule.formatMessage(event),
          });
        }
      } catch (e) {
        console.error(`[AlertRules] Error evaluating rule "${name}":`, e.message);
      }
    }

    return matchedRules;
  }

  shouldAlert(event) {
    return this.evaluate(event).length > 0;
  }

  loadDefaultRules() {
    this.addRule('large_transfer', {
      type: 'amountThreshold',
      enabled: true,
      severity: 'warning',
      description: 'Transfer amount >= 1000 tokens',
      condition: {
        field: 'returnValues.value',
        min: 1000,
        decimals: 18,
      },
      messageTemplate: '💰 Large transfer detected: {{returnValues.value}} tokens from {{returnValues.from}} to {{returnValues.to}}',
    });

    this.addRule('whale_address', {
      type: 'address',
      enabled: true,
      severity: 'high',
      description: 'Transaction involving whale addresses',
      condition: {
        fields: ['returnValues.from', 'returnValues.to'],
        blacklist: [],
        whitelist: [],
      },
      messageTemplate: '🐳 Whale activity detected involving {{contractAddress}}',
    });

    this.addRule('all_events', {
      type: 'eventName',
      enabled: false,
      severity: 'info',
      description: 'Alert on all events',
      condition: {
        eventNames: [],
        exclude: [],
      },
    });

    console.log('[AlertRules] Default rules loaded');
    return this;
  }
}

module.exports = {
  AlertRule,
  AlertRuleEngine,
};
