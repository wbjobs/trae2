const { EventEmitter } = require('events');

class RateLimiter {
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || 1000;
    this.windowMs = options.windowMs || 1000;
    this.maxConcurrency = options.maxConcurrency || 100;
    this.highWaterMark = options.highWaterMark || 5000;
    this.requests = [];
    this.currentConcurrency = 0;
    this.waitingQueue = [];
    this.isOverloaded = false;
    this.droppedCount = 0;
  }

  _cleanup() {
    const now = Date.now();
    while (this.requests.length > 0 && this.requests[0] < now - this.windowMs) {
      this.requests.shift();
    }
  }

  tryAcquire() {
    this._cleanup();
    if (this.requests.length >= this.maxRequests) {
      return false;
    }
    if (this.currentConcurrency >= this.maxConcurrency) {
      return false;
    }
    this.requests.push(Date.now());
    this.currentConcurrency++;
    this._updateOverloadStatus();
    return true;
  }

  async acquire() {
    return new Promise((resolve, reject) => {
      if (this.tryAcquire()) {
        resolve();
      } else {
        if (this.waitingQueue.length >= this.highWaterMark) {
          this.droppedCount++;
          reject(new Error('Rate limiter queue full'));
        } else {
          this.waitingQueue.push({ resolve, reject, time: Date.now() });
          this._processWaiting();
        }
      }
    });
  }

  release() {
    this.currentConcurrency = Math.max(0, this.currentConcurrency - 1);
    this._updateOverloadStatus();
    this._processWaiting();
  }

  _processWaiting() {
    while (this.waitingQueue.length > 0 && this.currentConcurrency < this.maxConcurrency) {
      this._cleanup();
      if (this.requests.length >= this.maxRequests) break;
      const item = this.waitingQueue.shift();
      const now = Date.now();
      if (now - item.time > this.windowMs * 2) {
        item.reject(new Error('Wait timeout'));
        this.droppedCount++;
        continue;
      }
      this.requests.push(now);
      this.currentConcurrency++;
      item.resolve();
    }
  }

  _updateOverloadStatus() {
    const load = this.requests.length / this.maxRequests;
    const wasOverloaded = this.isOverloaded;
    this.isOverloaded = load > 0.9 || this.currentConcurrency > this.maxConcurrency * 0.9;
    if (this.isOverloaded !== wasOverloaded) {
      console.log(`[RateLimiter] Overload status: ${this.isOverloaded}, load: ${load.toFixed(2)}`);
    }
  }

  getStats() {
    this._cleanup();
    return {
      currentRequests: this.requests.length,
      maxRequests: this.maxRequests,
      currentConcurrency: this.currentConcurrency,
      maxConcurrency: this.maxConcurrency,
      waitingQueue: this.waitingQueue.length,
      isOverloaded: this.isOverloaded,
      droppedCount: this.droppedCount,
    };
  }
}

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeoutMs = options.timeoutMs || 30000;
    this.failureCount = 0;
    this.successCount = 0;
    this.state = 'CLOSED';
    this.lastFailureTime = 0;
  }

  allowRequest() {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeoutMs) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED';
        this.failureCount = 0;
      }
    } else {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

module.exports = { RateLimiter, CircuitBreaker };
