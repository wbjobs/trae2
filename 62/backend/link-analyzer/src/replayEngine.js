/**
 * 链路故障时序回放引擎
 *
 * 功能:
 * - 故障事件持久化存储（内存+本地文件）
 * - 播放控制：播放/暂停/倍速/跳转
 * - 时间轴导航与刻度
 * - 关键事件标记（故障发生/恢复/升级）
 * - 回放过程实时推送
 * - 按严重度/链路类型过滤
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const MAX_EVENT_COUNT = 5000;
const EVENT_TYPES = {
  FAULT_OCCURRED: 'fault_occurred',
  FAULT_RECOVERED: 'fault_recovered',
  SEVERITY_UPGRADE: 'severity_upgrade',
  SEVERITY_DOWNGRADE: 'severity_downgrade',
  FLUCTUATION: 'fluctuation',
};

const SEVERITY_LABELS = {
  normal: '正常',
  warning: '警告',
  critical: '严重',
  fatal: '致命',
};

class FaultReplayEngine {
  constructor(dataDir) {
    this.events = [];
    this.replaySessions = new Map();
    this.dataDir = path.join(dataDir || __dirname, '..', 'data', 'fault-events');
    this.persistenceEnabled = true;

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    this._loadPersistedEvents();
    setInterval(() => this._persistEvents(), 60000);
  }

  _loadPersistedEvents() {
    try {
      const files = fs.readdirSync(this.dataDir)
        .filter(f => f.startsWith('fault-events-') && f.endsWith('.json'))
        .sort()
        .slice(-5);

      for (const file of files) {
        const filepath = path.join(this.dataDir, file);
        const content = fs.readFileSync(filepath, 'utf8');
        const events = JSON.parse(content);
        this.events.push(...events);
      }

      if (this.events.length > MAX_EVENT_COUNT) {
        this.events = this.events.slice(-MAX_EVENT_COUNT);
      }

      console.log('[FaultReplay] 已加载 ' + this.events.length + ' 条历史故障事件');
    } catch (err) {
      console.warn('[FaultReplay] 加载历史事件失败:', err.message);
    }
  }

  _persistEvents() {
    if (!this.persistenceEnabled || this.events.length === 0) return;

    try {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const filename = `fault-events-${today}.json`;
      const filepath = path.join(this.dataDir, filename);

      const recentEvents = this.events.filter(e => {
        const eventDate = new Date(e.timestamp).toISOString().slice(0, 10).replace(/-/g, '');
        return eventDate === today;
      });

      fs.writeFileSync(filepath, JSON.stringify(recentEvents, null, 2));
    } catch (err) {
      console.warn('[FaultReplay] 持久化事件失败:', err.message);
    }
  }

  recordFaultEvent(link, eventType, details = {}) {
    const event = {
      id: uuidv4(),
      eventType,
      linkId: link.id,
      linkName: link.name,
      linkType: link.link_type,
      timestamp: new Date().toISOString(),
      timestampMs: Date.now(),
      severity: link.severity,
      prevSeverity: details.prevSeverity || null,
      metrics: {
        latency: link.current_latency,
        packetLoss: link.current_packet_loss,
        jitter: link.current_jitter,
        availability: link.availability,
      },
      reasons: link.abnormal_reasons || [],
      matchedRules: link.matched_rules || [],
      ...details,
    };

    this.events.push(event);

    if (this.events.length > MAX_EVENT_COUNT) {
      this.events.shift();
    }

    return event;
  }

  queryEvents(options = {}) {
    const {
      linkId,
      linkType,
      eventType,
      severity,
      startTime,
      endTime,
      limit = 500,
      offset = 0,
    } = options;

    let results = this.events.slice();

    if (linkId) results = results.filter(e => e.linkId === linkId);
    if (linkType) results = results.filter(e => e.linkType === linkType);
    if (eventType) results = results.filter(e => e.eventType === eventType);
    if (severity) results = results.filter(e => e.severity === severity);
    if (startTime) results = results.filter(e => e.timestampMs >= startTime);
    if (endTime) results = results.filter(e => e.timestampMs <= endTime);

    return {
      total: results.length,
      returned: Math.min(limit, results.length - offset),
      events: results.slice(offset, offset + limit),
    };
  }

  getEventTimeline(options = {}) {
    const { startTime, endTime, interval = 60000 } = options;
    const queryResult = this.queryEvents({ startTime, endTime, limit: MAX_EVENT_COUNT });

    const buckets = {};
    queryResult.events.forEach(event => {
      const bucketStart = Math.floor(event.timestampMs / interval) * interval;
      if (!buckets[bucketStart]) {
        buckets[bucketStart] = {
          timestamp: bucketStart,
          total: 0,
          bySeverity: { warning: 0, critical: 0, fatal: 0 },
          byType: {},
          events: [],
        };
      }
      buckets[bucketStart].total++;
      buckets[bucketStart].bySeverity[event.severity] = (buckets[bucketStart].bySeverity[event.severity] || 0) + 1;
      buckets[bucketStart].byType[event.linkType] = (buckets[bucketStart].byType[event.linkType] || 0) + 1;
      buckets[bucketStart].events.push(event.id);
    });

    return Object.values(buckets).sort((a, b) => a.timestamp - b.timestamp);
  }

  createReplaySession(options = {}) {
    const {
      startTime,
      endTime,
      linkIds,
      severities,
      speed = 1,
      loop = false,
    } = options;

    const sessionId = uuidv4();
    const events = this.queryEvents({
      startTime,
      endTime,
      limit: MAX_EVENT_COUNT,
    }).events.filter(e => {
      if (linkIds && !linkIds.includes(e.linkId)) return false;
      if (severities && !severities.includes(e.severity)) return false;
      return true;
    });

    const session = {
      id: sessionId,
      startTime: startTime || (events.length ? events[0].timestampMs : Date.now()),
      endTime: endTime || (events.length ? events[events.length - 1].timestampMs : Date.now()),
      currentTime: startTime || (events.length ? events[0].timestampMs : Date.now()),
      events,
      eventIndex: 0,
      speed,
      loop,
      isPlaying: false,
      isPaused: false,
      playbackTimer: null,
      lastEventTime: null,
    };

    this.replaySessions.set(sessionId, session);
    return sessionId;
  }

  startReplay(sessionId, onEvent, onComplete) {
    const session = this.replaySessions.get(sessionId);
    if (!session) return false;

    session.isPlaying = true;
    session.isPaused = false;

    const playNext = () => {
      if (!session.isPlaying || session.isPaused) return;

      const nextEvent = session.events.find(e => e.timestampMs > session.currentTime);

      if (nextEvent) {
        const timeDiff = nextEvent.timestampMs - session.currentTime;
        const actualDelay = timeDiff / session.speed;

        session.playbackTimer = setTimeout(() => {
          session.currentTime = nextEvent.timestampMs;
          session.lastEventTime = nextEvent.timestampMs;
          onEvent && onEvent(nextEvent, session);

          const idx = session.events.findIndex(e => e.id === nextEvent.id);
          if (idx >= 0) session.eventIndex = idx;

          setImmediate(playNext);
        }, Math.max(10, Math.min(actualDelay, 5000)));
      } else {
        if (session.loop) {
          session.currentTime = session.startTime;
          session.eventIndex = 0;
          setImmediate(playNext);
        } else {
          session.isPlaying = false;
          onComplete && onComplete(session);
        }
      }
    };

    setImmediate(playNext);
    return true;
  }

  pauseReplay(sessionId) {
    const session = this.replaySessions.get(sessionId);
    if (!session) return false;
    session.isPaused = true;
    if (session.playbackTimer) {
      clearTimeout(session.playbackTimer);
      session.playbackTimer = null;
    }
    return true;
  }

  resumeReplay(sessionId, onEvent, onComplete) {
    const session = this.replaySessions.get(sessionId);
    if (!session) return false;
    session.isPaused = false;
    return this.startReplay(sessionId, onEvent, onComplete);
  }

  seekToTime(sessionId, targetTime) {
    const session = this.replaySessions.get(sessionId);
    if (!session) return false;

    session.currentTime = targetTime;
    const idx = session.events.findIndex(e => e.timestampMs >= targetTime);
    session.eventIndex = idx >= 0 ? idx : session.events.length;

    return {
      currentTime: session.currentTime,
      eventIndex: session.eventIndex,
      progress: this._calculateProgress(session),
    };
  }

  setReplaySpeed(sessionId, speed) {
    const session = this.replaySessions.get(sessionId);
    if (!session) return false;
    session.speed = Math.max(0.25, Math.min(16, speed));
    return true;
  }

  stopReplay(sessionId) {
    const session = this.replaySessions.get(sessionId);
    if (!session) return false;

    session.isPlaying = false;
    session.isPaused = false;
    if (session.playbackTimer) {
      clearTimeout(session.playbackTimer);
      session.playbackTimer = null;
    }

    this.replaySessions.delete(sessionId);
    return true;
  }

  getReplayStatus(sessionId) {
    const session = this.replaySessions.get(sessionId);
    if (!session) return null;

    return {
      id: session.id,
      startTime: session.startTime,
      endTime: session.endTime,
      currentTime: session.currentTime,
      eventIndex: session.eventIndex,
      totalEvents: session.events.length,
      speed: session.speed,
      isPlaying: session.isPlaying,
      isPaused: session.isPaused,
      loop: session.loop,
      progress: this._calculateProgress(session),
    };
  }

  _calculateProgress(session) {
    const duration = session.endTime - session.startTime;
    if (duration <= 0) return 0;
    return Math.min(100, ((session.currentTime - session.startTime) / duration) * 100);
  }

  exportEvents(options = {}) {
    const result = this.queryEvents(options);
    return {
      exportTime: new Date().toISOString(),
      filter: options,
      totalExported: result.events.length,
      events: result.events,
      summary: this._generateEventSummary(result.events),
    };
  }

  _generateEventSummary(events) {
    const bySeverity = { warning: 0, critical: 0, fatal: 0 };
    const byType = {};
    const byLink = {};

    events.forEach(e => {
      bySeverity[e.severity] = (bySeverity[e.severity] || 0) + 1;
      byType[e.linkType] = (byType[e.linkType] || 0) + 1;
      byLink[e.linkName] = (byLink[e.linkName] || 0) + 1;
    });

    return { bySeverity, byType, byLink, eventCount: events.length };
  }

  getFaultDurationStats(linkId, startTime, endTime) {
    const events = this.queryEvents({ linkId, startTime, endTime, limit: MAX_EVENT_COUNT }).events;
    if (events.length === 0) return null;

    let totalFaultTime = 0;
    let faultStartTime = null;
    const faultPeriods = [];

    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.eventType === EVENT_TYPES.FAULT_OCCURRED || e.eventType === EVENT_TYPES.SEVERITY_UPGRADE) {
        if (!faultStartTime) faultStartTime = e.timestampMs;
      } else if (e.eventType === EVENT_TYPES.FAULT_RECOVERED) {
        if (faultStartTime) {
          const duration = e.timestampMs - faultStartTime;
          totalFaultTime += duration;
          faultPeriods.push({ start: faultStartTime, end: e.timestampMs, duration });
          faultStartTime = null;
        }
      }
    }

    const avgDuration = faultPeriods.length > 0 ? totalFaultTime / faultPeriods.length : 0;
    const maxDuration = faultPeriods.length > 0 ? Math.max(...faultPeriods.map(p => p.duration)) : 0;

    return {
      linkId,
      totalFaultTime,
      faultCount: faultPeriods.length,
      avgDuration,
      maxDuration,
      faultPeriods,
    };
  }

  getActiveSessions() {
    return Array.from(this.replaySessions.values()).map(s => ({
      id: s.id,
      isPlaying: s.isPlaying,
      isPaused: s.isPaused,
      progress: this._calculateProgress(s),
      eventCount: s.events.length,
      speed: s.speed,
    }));
  }
}

module.exports = {
  FaultReplayEngine,
  EVENT_TYPES,
  MAX_EVENT_COUNT,
};
