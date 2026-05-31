const logger = require('../utils/logger');
const redisClient = require('../utils/redis');
const { config, AlertLevel } = require('../config');

const POLICY_CACHE_KEY = 'alert:policy:current';
const POLICY_SCHEDULE_KEY = 'alert:policy:schedule';
const POLICY_SWITCH_INTERVAL = 60000;

const DEFAULT_POLICIES = {
  normal: {
    name: '常规监测',
    description: '日常监测模式，标准阈值',
    thresholds: {
      potential: {
        warning: -850,
        critical: -1000,
        emergency: -1150
      },
      thickness: {
        warning: 10,
        critical: 20,
        emergency: 30
      }
    }
  },
  strict: {
    name: '严格监测',
    description: '敏感区域/特殊时段，严格阈值',
    thresholds: {
      potential: {
        warning: -800,
        critical: -900,
        emergency: -1000
      },
      thickness: {
        warning: 5,
        critical: 10,
        emergency: 15
      }
    }
  },
  relaxed: {
    name: '宽松监测',
    description: '非敏感时段，宽松阈值',
    thresholds: {
      potential: {
        warning: -900,
        critical: -1050,
        emergency: -1200
      },
      thickness: {
        warning: 15,
        critical: 25,
        emergency: 35
      }
    }
  },
  emergency: {
    name: '应急监测',
    description: '应急响应模式，最严格阈值',
    thresholds: {
      potential: {
        warning: -750,
        critical: -850,
        emergency: -950
      },
      thickness: {
        warning: 3,
        critical: 8,
        emergency: 12
      }
    }
  }
};

const DEFAULT_SCHEDULE = [
  {
    id: 'night',
    name: '夜间监测',
    policy: 'relaxed',
    startTime: '22:00',
    endTime: '06:00',
    days: [0, 1, 2, 3, 4, 5, 6],
    enabled: true
  },
  {
    id: 'morning',
    name: '早间监测',
    policy: 'strict',
    startTime: '06:00',
    endTime: '09:00',
    days: [0, 1, 2, 3, 4, 5, 6],
    enabled: true
  },
  {
    id: 'daytime',
    name: '日间监测',
    policy: 'normal',
    startTime: '09:00',
    endTime: '17:00',
    days: [0, 1, 2, 3, 4, 5, 6],
    enabled: true
  },
  {
    id: 'evening',
    name: '晚间监测',
    policy: 'normal',
    startTime: '17:00',
    endTime: '22:00',
    days: [0, 1, 2, 3, 4, 5, 6],
    enabled: true
  },
  {
    id: 'weekend',
    name: '周末监测',
    policy: 'relaxed',
    startTime: '00:00',
    endTime: '23:59',
    days: [0, 6],
    enabled: false
  }
];

class AlertPolicyService {
  constructor() {
    this.currentPolicy = 'normal';
    this.schedule = DEFAULT_SCHEDULE;
    this.switchTimer = null;
    this.manualOverride = false;
    this.init();
  }

  async init() {
    await this.loadCurrentPolicy();
    await this.loadSchedule();
    this.startPolicyScheduler();
    logger.info('Alert policy service initialized');
  }

  async loadCurrentPolicy() {
    try {
      const cached = await redisClient.get(POLICY_CACHE_KEY);
      if (cached) {
        const policyData = JSON.parse(cached);
        this.currentPolicy = policyData.currentPolicy;
        this.manualOverride = policyData.manualOverride || false;
        logger.info(`Loaded current policy from cache: ${this.currentPolicy}`);
      }
    } catch (err) {
      logger.warn('Failed to load current policy from cache, using default');
    }
  }

  async loadSchedule() {
    try {
      const cached = await redisClient.get(POLICY_SCHEDULE_KEY);
      if (cached) {
        this.schedule = JSON.parse(cached);
        logger.info(`Loaded schedule from cache: ${this.schedule.length} rules`);
      }
    } catch (err) {
      logger.warn('Failed to load schedule from cache, using default');
    }
  }

  startPolicyScheduler() {
    this.checkAndSwitchPolicy();

    this.switchTimer = setInterval(() => {
      this.checkAndSwitchPolicy();
    }, POLICY_SWITCH_INTERVAL);

    logger.info('Policy scheduler started');
  }

  stopPolicyScheduler() {
    if (this.switchTimer) {
      clearInterval(this.switchTimer);
      this.switchTimer = null;
      logger.info('Policy scheduler stopped');
    }
  }

  getCurrentTimeInfo() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const currentTime = `${hours}:${minutes}`;
    const currentDay = now.getDay();

    return { currentTime, currentDay, timestamp: now.getTime() };
  }

  isTimeInRange(startTime, endTime, currentTime) {
    if (startTime === endTime) return true;

    if (startTime < endTime) {
      return currentTime >= startTime && currentTime < endTime;
    } else {
      return currentTime >= startTime || currentTime < endTime;
    }
  }

  async checkAndSwitchPolicy() {
    if (this.manualOverride) {
      logger.debug('Manual override active, skipping schedule check');
      return;
    }

    const { currentTime, currentDay } = this.getCurrentTimeInfo();

    let matchedPolicy = null;
    let matchedRule = null;

    for (const rule of this.schedule) {
      if (!rule.enabled) continue;
      if (!rule.days.includes(currentDay)) continue;

      if (this.isTimeInRange(rule.startTime, rule.endTime, currentTime)) {
        matchedPolicy = rule.policy;
        matchedRule = rule;
        break;
      }
    }

    if (matchedPolicy && matchedPolicy !== this.currentPolicy) {
      await this.switchPolicy(matchedPolicy, `schedule:${matchedRule.id}`);
    }
  }

  async switchPolicy(policyName, reason = 'manual') {
    if (!DEFAULT_POLICIES[policyName]) {
      throw new Error(`Unknown policy: ${policyName}`);
    }

    const policy = DEFAULT_POLICIES[policyName];

    try {
      const alertThresholdService = require('./alertThreshold.service');

      await alertThresholdService.updateThresholds('potential', policy.thresholds.potential);
      await alertThresholdService.updateThresholds('thickness', policy.thresholds.thickness);

      this.currentPolicy = policyName;

      await redisClient.set(POLICY_CACHE_KEY, JSON.stringify({
        currentPolicy: this.currentPolicy,
        manualOverride: this.manualOverride,
        switchedAt: Date.now(),
        switchedBy: reason
      }), 86400);

      logger.info(`Policy switched to ${policyName} (${policy.name}), reason: ${reason}`);

      return {
        success: true,
        policy: policyName,
        name: policy.name,
        thresholds: policy.thresholds,
        switchedAt: Date.now()
      };
    } catch (err) {
      logger.error('Failed to switch policy:', err);
      throw err;
    }
  }

  async setManualOverride(enabled, policyName = null) {
    this.manualOverride = enabled;

    if (enabled && policyName) {
      await this.switchPolicy(policyName, 'manual_override');
    }

    await redisClient.set(POLICY_CACHE_KEY, JSON.stringify({
      currentPolicy: this.currentPolicy,
      manualOverride: this.manualOverride,
      switchedAt: Date.now(),
      switchedBy: 'manual'
    }), 86400);

    return {
      success: true,
      manualOverride: this.manualOverride,
      currentPolicy: this.currentPolicy
    };
  }

  async updateSchedule(schedule) {
    this.schedule = schedule;
    await redisClient.set(POLICY_SCHEDULE_KEY, JSON.stringify(schedule), 86400);

    logger.info(`Schedule updated: ${schedule.length} rules`);

    if (!this.manualOverride) {
      await this.checkAndSwitchPolicy();
    }

    return { success: true, rules: schedule.length };
  }

  async addScheduleRule(rule) {
    rule.id = rule.id || `rule-${Date.now()}`;
    rule.enabled = rule.enabled !== false;

    this.schedule.push(rule);
    await this.updateSchedule(this.schedule);

    return rule;
  }

  async removeScheduleRule(ruleId) {
    const index = this.schedule.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      this.schedule.splice(index, 1);
      await this.updateSchedule(this.schedule);
      return { success: true };
    }
    return { success: false, message: 'Rule not found' };
  }

  getCurrentPolicy() {
    return {
      currentPolicy: this.currentPolicy,
      policy: DEFAULT_POLICIES[this.currentPolicy],
      manualOverride: this.manualOverride,
      timeInfo: this.getCurrentTimeInfo()
    };
  }

  getAllPolicies() {
    return Object.entries(DEFAULT_POLICIES).map(([key, policy]) => ({
      key,
      ...policy
    }));
  }

  getSchedule() {
    return this.schedule;
  }
}

module.exports = new AlertPolicyService();
