import { Router, Request, Response } from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { config } from '../config'
import { createLogger } from '../utils/logger'
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth'
import { rateLimitMiddleware } from '../middleware/rateLimit'
import { tracePropagationMiddleware, injectTraceHeaders, TracePropagationRequest } from '../middleware/tracePropagation'

const logger = createLogger('routes')

const router = Router()

router.use(tracePropagationMiddleware)

const collectorProxy = createProxyMiddleware({
  target: config.services.collector,
  changeOrigin: true,
  pathRewrite: {
    '^/api/logs': '/logs',
    '^/api/trace': '/trace',
    '^/api/clusters': '/clusters'
  },
  onProxyReq: (proxyReq, req, res) => {
    injectTraceHeaders(proxyReq, req as TracePropagationRequest)
    logger.debug('Proxying request to collector', {
      path: req.url,
      method: req.method,
      traceId: (req as TracePropagationRequest).traceContext?.traceId
    })
  },
  onProxyRes: (proxyRes, req, res) => {
    const traceContext = (req as TracePropagationRequest).traceContext
    if (traceContext) {
      const duration = Date.now() - traceContext.startTime
      logger.debug('Collector proxy response', {
        traceId: traceContext.traceId,
        status: proxyRes.statusCode,
        duration: `${duration}ms`
      })
    }
  },
  onError: (err, req, res) => {
    const traceContext = (req as TracePropagationRequest).traceContext
    logger.error('Collector proxy error:', {
      error: err.message,
      traceId: traceContext?.traceId
    })
    res.status(503).json({
      success: false,
      message: '日志采集服务不可用',
      traceId: traceContext?.traceId
    })
  }
})

const storageProxy = createProxyMiddleware({
  target: config.services.storage,
  changeOrigin: true,
  pathRewrite: {
    '^/api/sources': '/sources',
    '^/api/dashboards': '/dashboards'
  },
  onProxyReq: (proxyReq, req, res) => {
    injectTraceHeaders(proxyReq, req as TracePropagationRequest)
    logger.debug('Proxying request to storage', {
      path: req.url,
      method: req.method,
      traceId: (req as TracePropagationRequest).traceContext?.traceId
    })
  },
  onProxyRes: (proxyRes, req, res) => {
    const traceContext = (req as TracePropagationRequest).traceContext
    if (traceContext) {
      const duration = Date.now() - traceContext.startTime
      logger.debug('Storage proxy response', {
        traceId: traceContext.traceId,
        status: proxyRes.statusCode,
        duration: `${duration}ms`
      })
    }
  },
  onError: (err, req, res) => {
    const traceContext = (req as TracePropagationRequest).traceContext
    logger.error('Storage proxy error:', {
      error: err.message,
      traceId: traceContext?.traceId
    })
    res.status(503).json({
      success: false,
      message: '存储服务不可用',
      traceId: traceContext?.traceId
    })
  }
})

router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Gateway is running',
    timestamp: new Date().toISOString(),
    platform: config.platform
  })
})

router.post('/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: '用户名和密码不能为空'
    })
  }

  if (username === 'admin' && password === 'admin123') {
    const { generateToken } = require('../middleware/auth')
    const token = generateToken({
      id: '1',
      username: 'admin',
      role: 'admin'
    })

    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: '1',
          username: 'admin',
          role: 'admin'
        }
      }
    })
  }

  res.status(401).json({
    success: false,
    message: '用户名或密码错误'
  })
})

router.use('/auth', (req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在'
  })
})

router.use('/logs', authMiddleware, rateLimitMiddleware, collectorProxy)
router.use('/trace', authMiddleware, rateLimitMiddleware, collectorProxy)
router.use('/clusters', authMiddleware, rateLimitMiddleware, collectorProxy)

router.use('/sources', authMiddleware, rateLimitMiddleware, storageProxy)
router.use('/dashboards', authMiddleware, rateLimitMiddleware, storageProxy)

router.get('/services/status', authMiddleware, async (req: Request, res: Response) => {
  const services = {
    gateway: { status: 'online', url: `http://localhost:${config.port}` },
    collector: { status: 'unknown', url: config.services.collector },
    storage: { status: 'unknown', url: config.services.storage }
  }

  try {
    const collectorRes = await fetch(`${config.services.collector}/health`, {
      method: 'GET'
    })
    services.collector.status = collectorRes.ok ? 'online' : 'offline'
  } catch (error) {
    services.collector.status = 'offline'
  }

  try {
    const storageRes = await fetch(`${config.services.storage}/health`, {
      method: 'GET'
    })
    services.storage.status = storageRes.ok ? 'online' : 'offline'
  } catch (error) {
    services.storage.status = 'offline'
  }

  res.json({
    success: true,
    data: services
  })
})

export default router