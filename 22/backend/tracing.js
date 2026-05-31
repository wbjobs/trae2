const crypto = require('crypto');

class TraceContext {
  constructor(options = {}) {
    this.traceId = options.traceId || this._generateTraceId();
    this.spanId = options.spanId || this._generateSpanId();
    this.parentSpanId = options.parentSpanId || null;
    this.timestamp = options.timestamp || Date.now();
    this.nodes = options.nodes || [];
    this.actions = options.actions || [];
    this.filters = options.filters || [];
    this.finalStatus = 'pending';
  }

  _generateTraceId() {
    return 'trace-' + Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
  }

  _generateSpanId() {
    return 'span-' + crypto.randomBytes(3).toString('hex');
  }

  recordNode(nodeId, role) {
    this.nodes.push({
      nodeId,
      role,
      timestamp: Date.now(),
    });
    return this;
  }

  recordAction(action, details) {
    this.actions.push({
      action,
      details,
      timestamp: Date.now(),
    });
    return this;
  }

  recordFilter(ruleId, ruleName, action) {
    this.filters.push({
      ruleId,
      ruleName,
      action,
      timestamp: Date.now(),
    });
    return this;
  }

  setStatus(status) {
    this.finalStatus = status;
    return this;
  }

  toJSON() {
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      timestamp: this.timestamp,
      nodes: this.nodes,
      actions: this.actions,
      filters: this.filters,
      finalStatus: this.finalStatus,
    };
  }

  createChildSpan() {
    return new TraceContext({
      traceId: this.traceId,
      parentSpanId: this.spanId,
    });
  }
}

class TraceManager {
  constructor(options = {}) {
    this.traces = new Map();
    this.maxTraces = options.maxTraces || 10000;
    this.ttl = options.ttl || 300000;
    this.samplers = [];
    this.stats = { created: 0, completed: 0, expired: 0 };
  }

  createTrace(initialNode) {
    const trace = new TraceContext();
    if (initialNode) trace.recordNode(initialNode, 'entry');
    this._addToStore(trace);
    this.stats.created++;
    return trace;
  }

  getTrace(traceId) {
    return this.traces.get(traceId);
  }

  completeTrace(traceId, status) {
    const trace = this.traces.get(traceId);
    if (trace) {
      trace.setStatus(status);
      this.stats.completed++;
      return trace.toJSON();
    }
    return null;
  }

  recordMessageTrace(message, nodeId, role) {
    const traceId = message.traceId;
    let trace;
    if (traceId) {
      trace = this.traces.get(traceId);
      if (!trace) {
        trace = new TraceContext({ traceId });
        this._addToStore(trace);
      }
    } else {
      trace = this.createTrace(nodeId);
    }
    trace.recordNode(nodeId, role);
    message.traceId = trace.traceId;
    message.spanId = trace.spanId;
    message.traceContext = trace.toJSON();
    return trace;
  }

  _addToStore(trace) {
    if (this.traces.size >= this.maxTraces) {
      const oldestKey = this.traces.keys().next().value;
      this.traces.delete(oldestKey);
      this.stats.expired++;
    }
    this.traces.set(trace.traceId, trace);
  }

  cleanup() {
    const now = Date.now();
    const expired = [];
    for (const [traceId, trace] of this.traces) {
      if (now - trace.timestamp > this.ttl) {
        expired.push(traceId);
      }
    }
    for (const id of expired) {
      this.traces.delete(id);
      this.stats.expired++;
    }
    return expired.length;
  }

  getStats() {
    return {
      totalTraces: this.traces.size,
      maxTraces: this.maxTraces,
      ...this.stats,
    };
  }

  getRecentTraces(limit = 50) {
    const traces = [];
    const values = Array.from(this.traces.values());
    for (let i = values.length - 1; i >= 0 && traces.length < limit; i--) {
      traces.push(values[i].toJSON());
    }
    return traces;
  }

  getTraceById(traceId) {
    const trace = this.traces.get(traceId);
    return trace ? trace.toJSON() : null;
  }
}

module.exports = { TraceContext, TraceManager };
