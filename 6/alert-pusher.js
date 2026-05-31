const axios = require('axios');
const config = require('./config');
const { AlertRuleEngine } = require('./alert-rules');

class AlertPusher {
  constructor(ruleEngine = null) {
    this.enabled = config.alert.enabled;
    this.webhookUrl = config.alert.webhookUrl;
    this.ruleEngine = ruleEngine || new AlertRuleEngine();
    this.useLegacyMode = config.alert.useLegacyAlert === 'true';
    this.rateLimit = parseInt(config.alert.rateLimit) || 10;
    this.lastSentTimes = [];
    this.dedupeWindow = 60000;

    if (!this.useLegacyMode) {
      this.ruleEngine.loadDefaultRules();
    }
  }

  addRule(name, config) {
    return this.ruleEngine.addRule(name, config);
  }

  removeRule(name) {
    return this.ruleEngine.removeRule(name);
  }

  listRules() {
    return this.ruleEngine.listRules();
  }

  _checkRateLimit() {
    const now = Date.now();
    this.lastSentTimes = this.lastSentTimes.filter(t => now - t < this.dedupeWindow);
    if (this.lastSentTimes.length >= this.rateLimit) {
      console.warn(`[Alert] Rate limit exceeded: ${this.rateLimit} per minute`);
      return false;
    }
    this.lastSentTimes.push(now);
    return true;
  }

  shouldAlert(event) {
    if (!this.enabled) return false;

    if (this.useLegacyMode) {
      const alertEvents = new Set(config.alert.events);
      if (alertEvents.size === 0) return true;
      return alertEvents.has(event.eventName);
    }

    return this.ruleEngine.shouldAlert(event);
  }

  getMatchedRules(event) {
    if (this.useLegacyMode) {
      return this.shouldAlert(event) ? [{ name: 'legacy', severity: 'info' }] : [];
    }
    return this.ruleEngine.evaluate(event);
  }

  _getSeverityEmoji(severity) {
    switch (severity) {
      case 'critical': return '🔴';
      case 'high': return '🟠';
      case 'warning': return '🟡';
      case 'low': return '🟢';
      default: return '🔵';
    }
  }

  _getSeverityColor(severity) {
    switch (severity) {
      case 'critical': return 'danger';
      case 'high': return 'warning';
      case 'warning': return 'warning';
      case 'low': return 'good';
      default: return 'info';
    }
  }

  formatMessage(parsedEvent, matchedRules = []) {
    const returnValuesStr = Object.entries(parsedEvent.returnValues)
      .map(([key, value]) => `• ${key}: ${value}`)
      .join('\n');

    const topRule = matchedRules.length > 0
      ? matchedRules.reduce((a, b) => {
        const order = { critical: 4, high: 3, warning: 2, info: 1 };
        return (order[a.severity] || 0) > (order[b.severity] || 0) ? a : b;
      })
      : { severity: 'info' };

    const severity = topRule.severity || 'info';
    const emoji = this._getSeverityEmoji(severity);
    const customMsg = matchedRules.find(r => r.customMessage)?.customMessage;
    const ruleNames = matchedRules.map(r => r.name).join(', ');

    const title = customMsg || `${emoji} Contract Event: ${parsedEvent.eventName}`;

    return {
      text: title,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: title,
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Contract:*\n${parsedEvent.contractAddress}`,
            },
            {
              type: 'mrkdwn',
              text: `*Block:*\n${parsedEvent.blockNumber}`,
            },
            {
              type: 'mrkdwn',
              text: `*Transaction:*\n${parsedEvent.transactionHash}`,
            },
            {
              type: 'mrkdwn',
              text: `*Severity:*\n${severity.toUpperCase()}`,
            },
          ],
        },
        returnValuesStr && {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Event Data:*\n${returnValuesStr}`,
          },
        },
        matchedRules.length > 0 && {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `_Matched rules: ${ruleNames}`,
            },
          ],
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'View on Etherscan',
                emoji: true,
              },
              url: `https://etherscan.io/tx/${parsedEvent.transactionHash}`,
              style: 'primary',
            },
          ],
        },
      ].filter(Boolean),
    };
  }

  async sendAlert(parsedEvent) {
    const matchedRules = this.getMatchedRules(parsedEvent);

    if (matchedRules.length === 0) {
      return false;
    }

    if (!this._checkRateLimit()) {
      return false;
    }

    try {
      const message = this.formatMessage(parsedEvent, matchedRules);

      await axios.post(this.webhookUrl, message, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      const ruleNames = matchedRules.map(r => r.name).join(', ');
      console.log(`[Alert] Sent alert for ${parsedEvent.eventName} (rules: ${ruleNames})`);
      return true;
    } catch (error) {
      console.error('[Alert] Error sending alert:', error.message);
      return false;
    }
  }

  async sendBatchAlerts(parsedEvents) {
    const results = [];
    for (const event of parsedEvents) {
      const result = await this.sendAlert(event);
      results.push(result);
    }
    return results;
  }

  async sendCustomAlert(title, message, details = {}, severity = 'info') {
    if (!this.enabled) return false;

    if (!this._checkRateLimit()) {
      return false;
    }

    try {
      const detailsStr = Object.entries(details)
        .map(([key, value]) => `• ${key}: ${value}`)
        .join('\n');

      const emoji = this._getSeverityEmoji(severity);

      const payload = {
        text: `${emoji} ${title}`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `${emoji} ${title}`,
              emoji: true,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: message,
            },
          },
          detailsStr && {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Details:*\n${detailsStr}`,
            },
          },
        ].filter(Boolean),
      };

      await axios.post(this.webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      console.log(`[Alert] Sent custom alert: ${title}`);
      return true;
    } catch (error) {
      console.error('[Alert] Error sending custom alert:', error.message);
      return false;
    }
  }
}

module.exports = AlertPusher;
