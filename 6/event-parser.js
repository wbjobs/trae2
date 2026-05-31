const crypto = require('crypto');

class EventParser {
  constructor() {
    this.eventHandlers = new Map();
  }

  static jsonReplacer(key, value) {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value === 'object' && value !== null) {
      if (value.type === 'BigNumber' || value._isBigNumber) {
        return value.toString();
      }
    }
    return value;
  }

  static safeStringify(obj) {
    try {
      return JSON.stringify(obj, EventParser.jsonReplacer);
    } catch (e) {
      console.error('[Parser] JSON.stringify failed:', e.message);
      try {
        return JSON.stringify(obj, (k, v) => {
          if (typeof v === 'bigint') return v.toString();
          if (v instanceof Object && v.constructor && v.constructor.name === 'BigNumber') return v.toString();
          return v;
        });
      } catch (e2) {
        return JSON.stringify({ error: 'serialization_failed' });
      }
    }
  }

  generateEventId(event) {
    const txHash = event.transactionHash || 'unknown';
    const logIdx = event.logIndex !== undefined ? event.logIndex : 'unknown';
    const contractAddr = event.contractAddress || event.address || 'unknown';
    const blockNum = event.blockNumber !== undefined ? event.blockNumber : '0';
    const data = `${txHash}-${logIdx}-${contractAddr}-${blockNum}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  registerHandler(eventName, handler) {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, []);
    }
    this.eventHandlers.get(eventName).push(handler);
  }

  extractEventName(event) {
    if (event.event && typeof event.event === 'string') {
      return event.event;
    }
    if (event.name && typeof event.name === 'string') {
      return event.name;
    }
    if (event.rawEvent && event.rawEvent.name) {
      return event.rawEvent.name;
    }
    if (event.topics && event.topics.length > 0) {
      return `topic_${event.topics[0].slice(0, 10)}`;
    }
    return 'Unknown';
  }

  extractContractAddress(event) {
    if (event.contractAddress) {
      return event.contractAddress.toLowerCase();
    }
    if (event.address) {
      return event.address.toLowerCase();
    }
    return 'unknown';
  }

  normalizeValue(value) {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value === 'object') {
      if (value._isBigNumber || (value.constructor && value.constructor.name === 'BigNumber')) {
        return value.toString();
      }
      if (value.type === 'BigNumber' || value.type === 'BN') {
        return value.toString();
      }
      if (Array.isArray(value)) {
        return value.map(v => this.normalizeValue(v));
      }
      if (value.constructor && value.constructor.name === 'Object') {
        const result = {};
        for (const [k, v] of Object.entries(value)) {
          if (!isNaN(Number(k)) && parseInt(k) >= 0) continue;
          result[k] = this.normalizeValue(v);
        }
        return result;
      }
    }
    return value;
  }

  parseEvent(event) {
    const eventId = this.generateEventId(event);
    const blockNumber = Number(event.blockNumber) || 0;
    const transactionHash = event.transactionHash || event.transaction || '';
    const logIndex = Number(event.logIndex) || 0;
    const contractAddress = this.extractContractAddress(event);
    const eventName = this.extractEventName(event);

    const returnValues = {};
    if (event.returnValues) {
      for (const [key, value] of Object.entries(event.returnValues)) {
        if (!isNaN(Number(key))) continue;
        if (key === '__length__') continue;
        returnValues[key] = this.normalizeValue(value);
      }
    }

    return {
      eventId,
      blockNumber,
      transactionHash,
      logIndex,
      contractAddress,
      eventName,
      returnValues,
      raw: EventParser.safeStringify(event),
      timestamp: new Date(),
    };
  }

  async parseEvents(events) {
    const parsedEvents = [];

    for (const event of events) {
      try {
        const parsed = this.parseEvent(event);
        parsedEvents.push(parsed);

        await this.triggerHandlers(parsed);
      } catch (error) {
        console.error('[Parser] Error parsing event:', error.message);
        try {
          console.error('[Parser] Event tx:', event.transactionHash || event.transaction || 'unknown');
        } catch (_) {}
      }
    }

    return parsedEvents;
  }

  async triggerHandlers(parsedEvent) {
    const handlers = this.eventHandlers.get(parsedEvent.eventName) || [];
    const allHandlers = this.eventHandlers.get('*') || [];

    const all = [...handlers, ...allHandlers];

    for (const handler of all) {
      try {
        await handler(parsedEvent);
      } catch (error) {
        console.error(`[Parser] Error in event handler for ${parsedEvent.eventName}:`, error.message);
      }
    }
  }
}

module.exports = EventParser;
