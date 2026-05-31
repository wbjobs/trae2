import fs from 'fs'
import path from 'path'
import config from '../config/index.js'

export interface StoredFile {
  originalName: string
  storedPath: string
  size: number
}

export const storageService = {
  async ensureDir(dirPath: string): Promise<void> {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }
  },

  async store(file: Express.Multer.File, subDir: string = ''): Promise<string> {
    const uploadDir = path.join(config.storage.uploadDir, subDir)
    await this.ensureDir(uploadDir)

    const ext = path.extname(file.originalname) || '.bin'
    const baseName = path.basename(file.originalname, ext)
    const timestamp = Date.now()
    const random = Math.random().toString(36).slice(2, 8)
    const storedName = `${baseName}_${timestamp}_${random}${ext}`
    const storedPath = path.join(uploadDir, storedName)

    if (fs.existsSync(file.path)) {
      fs.copyFileSync(file.path, storedPath)
      fs.unlinkSync(file.path)
    }

    return storedPath
  },

  async storeBuffer(buffer: Buffer, fileName: string, subDir: string = ''): Promise<string> {
    const uploadDir = path.join(config.storage.uploadDir, subDir)
    await this.ensureDir(uploadDir)

    const ext = path.extname(fileName) || '.bin'
    const baseName = path.basename(fileName, ext)
    const timestamp = Date.now()
    const random = Math.random().toString(36).slice(2, 8)
    const storedName = `${baseName}_${timestamp}_${random}${ext}`
    const storedPath = path.join(uploadDir, storedName)

    fs.writeFileSync(storedPath, buffer)
    return storedPath
  },

  delete(filePath: string): boolean {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        return true
      }
    } catch {
      // ignore
    }
    return false
  },

  exists(filePath: string): boolean {
    return fs.existsSync(filePath)
  },

  getAbsolutePath(relativePath: string): string {
    if (path.isAbsolute(relativePath)) {
      return relativePath
    }
    return path.resolve(config.storage.uploadDir, relativePath)
  },

  getRelativePath(absolutePath: string): string {
    return path.relative(config.storage.uploadDir, absolutePath)
  },
}
