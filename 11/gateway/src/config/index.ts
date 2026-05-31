import dotenv from 'dotenv'
import path from 'path'
import os from 'os'

dotenv.config()

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '8080', 10),
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  services: {
    collector: process.env.COLLECTOR_SERVICE_URL || 'http://localhost:8081',
    storage: process.env.STORAGE_SERVICE_URL || 'http://localhost:8082'
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10)
  },
  logLevel: process.env.LOG_LEVEL || 'debug',
  platform: os.platform() as 'linux' | 'win32' | 'darwin',
  tmpDir: os.tmpdir()
}