import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const config = {
  port: Number(process.env.PORT) || 3001,
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiresIn: '7d',
  },
  db: {
    path: process.env.DB_PATH || path.resolve(__dirname, '../../../data.db'),
  },
  storage: {
    uploadDir: process.env.UPLOAD_DIR || path.resolve(__dirname, '../../../uploads'),
    maxFileSize: 500 * 1024 * 1024,
  },
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
  upload: {
    timeout: 600000,
  },
  env: process.env.NODE_ENV || 'development',
}

export default config
