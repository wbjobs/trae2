const EventEmitter = require('events');

class ServiceRegistry extends EventEmitter {
  constructor() {
    super();
    this.services = new Map();
    this.heartbeatInterval = 30000;
    this.heartbeatTimeout = 60000;
    this._setupHeartbeatCheck();
  }

  async register(serviceName, serviceInfo) {
    const registration = {
      ...serviceInfo,
      name: serviceName,
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
      status: 'healthy'
    };

    this.services.set(serviceName, registration);
    this.emit('serviceRegistered', serviceName, registration);
    console.log(`📋 Service registered: ${serviceName} at ${serviceInfo.url}`);
    
    return registration;
  }

  async unregister(serviceName) {
    const removed = this.services.delete(serviceName);
    if (removed) {
      this.emit('serviceUnregistered', serviceName);
      console.log(`📋 Service unregistered: ${serviceName}`);
    }
    return removed;
  }

  getService(serviceName) {
    const service = this.services.get(serviceName);
    if (service && this._isServiceAlive(service)) {
      return service;
    }
    return null;
  }

  getAllServices() {
    const aliveServices = [];
    this.services.forEach((service, name) => {
      if (this._isServiceAlive(service)) {
        aliveServices.push({ ...service });
      }
    });
    return aliveServices;
  }

  async heartbeat(serviceName) {
    const service = this.services.get(serviceName);
    if (service) {
      service.lastHeartbeat = Date.now();
      service.status = 'healthy';
      return true;
    }
    return false;
  }

  _isServiceAlive(service) {
    const now = Date.now();
    return (now - service.lastHeartbeat) < this.heartbeatTimeout;
  }

  _setupHeartbeatCheck() {
    setInterval(() => {
      const now = Date.now();
      this.services.forEach((service, name) => {
        if (!this._isServiceAlive(service)) {
          if (service.status !== 'unhealthy') {
            service.status = 'unhealthy';
            this.emit('serviceUnhealthy', name, service);
            console.warn(`⚠️  Service unhealthy: ${name}`);
          }
        }
      });
    }, this.heartbeatInterval);
  }

  async callService(serviceName, endpoint, options = {}) {
    const service = this.getService(serviceName);
    if (!service) {
      throw new Error(`Service ${serviceName} not found or unhealthy`);
    }

    const url = `${service.url}${endpoint}`;
    const fetchOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...(options.body && { body: JSON.stringify(options.body) })
    };

    try {
      const response = await fetch(url, fetchOptions);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`❌ Service call failed: ${serviceName}${endpoint}`, error.message);
      throw error;
    }
  }

  async broadcast(endpoint, options = {}) {
    const results = {};
    const services = this.getAllServices();
    
    for (const service of services) {
      try {
        results[service.name] = await this.callService(
          service.name,
          endpoint,
          options
        );
      } catch (error) {
        results[service.name] = { error: error.message };
      }
    }
    
    return results;
  }

  getServiceStatus(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) return null;
    
    return {
      name: serviceName,
      status: this._isServiceAlive(service) ? 'healthy' : 'unhealthy',
      url: service.url,
      uptime: Date.now() - service.registeredAt,
      lastHeartbeat: service.lastHeartbeat
    };
  }

  getAllStatuses() {
    const statuses = {};
    this.services.forEach((_, name) => {
      statuses[name] = this.getServiceStatus(name);
    });
    return statuses;
  }

  clear() {
    this.services.clear();
    this.emit('registryCleared');
  }

  get size() {
    return this.services.size;
  }
}

module.exports = ServiceRegistry;
