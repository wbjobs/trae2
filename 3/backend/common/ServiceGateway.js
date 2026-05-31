const express = require('express');
const cors = require('cors');
const http = require('http');
const ServiceRegistry = require('./ServiceRegistry');

class ServiceGateway {
  constructor(options = {}) {
    this.port = options.port || 3000;
    this.serviceRegistry = new ServiceRegistry();
    this.app = express();
    this.server = null;
    this._setupMiddleware();
    this._setupRoutes();
  }

  _setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json({ limit: '100mb' }));
    this.app.use((req, res, next) => {
      console.log(`🌐 Gateway: ${req.method} ${req.path}`);
      next();
    });
  }

  _setupRoutes() {
    this.app.get('/', (req, res) => {
      res.json({
        service: 'api-gateway',
        version: '1.0.0',
        description: 'Point Cloud System API Gateway',
        services: this.serviceRegistry.getAllServices().map(s => ({
          name: s.name,
          url: s.url,
          status: s.status
        }))
      });
    });

    this.app.get('/health', (req, res) => {
      res.json({
        gateway: 'healthy',
        timestamp: new Date().toISOString(),
        services: this.serviceRegistry.getAllStatuses()
      });
    });

    this.app.get('/services', (req, res) => {
      res.json({
        success: true,
        data: this.serviceRegistry.getAllServices()
      });
    });

    this.app.get('/services/:name', (req, res) => {
      const service = this.serviceRegistry.getService(req.params.name);
      if (service) {
        res.json({ success: true, data: service });
      } else {
        res.status(404).json({ success: false, error: 'Service not found' });
      }
    });

    this.app.all('/:serviceName/*', async (req, res) => {
      const { serviceName } = req.params;
      const endpoint = req.path.replace(`/${serviceName}`, '');
      
      try {
        const result = await this.serviceRegistry.callService(
          serviceName,
          endpoint,
          {
            method: req.method,
            headers: req.headers,
            body: req.method !== 'GET' ? req.body : undefined
          }
        );
        res.json(result);
      } catch (error) {
        res.status(502).json({
          success: false,
          error: `Gateway error: ${error.message}`,
          service: serviceName,
          endpoint
        });
      }
    });

    this.app.post('/broadcast/*', async (req, res) => {
      const endpoint = req.path.replace('/broadcast', '');
      try {
        const results = await this.serviceRegistry.broadcast(endpoint, {
          method: req.method,
          body: req.body
        });
        res.json({ success: true, data: results });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`\n🌉 API Gateway running on http://localhost:${this.port}`);
        console.log(`📦 Route mappings:`);
        console.log(`   /tile-service/*  -> http://localhost:3001/*`);
        console.log(`   /spatial-index/* -> http://localhost:3002/*`);
        console.log(`   /health          -> Gateway health check`);
        console.log(`   /services        -> List all services`);
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log('🌉 API Gateway stopped');
          resolve();
        });
      });
    }
  }

  registerService(name, info) {
    return this.serviceRegistry.register(name, info);
  }
}

module.exports = ServiceGateway;
