import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { storageService } from './storageService.js'
import config from '../config/index.js'

interface ChunkUpload {
  uploadId: string
  fileName: string
  fileSize: number
  totalChunks: number
  uploadedChunks: number[]
  createdAt: number
}

interface ChunkUploadResult {
  uploadId: string
  complete: boolean
  filePath?: string
  progress: number
}

const activeUploads = new Map<string, ChunkUpload>()

function generateUploadId(): string {
  return crypto.randomBytes(16).toString('hex')
}

function getUploadDir(uploadId: string): string {
  return path.join(config.storage.uploadDir, 'chunks', uploadId)
}

function cleanupOldUploads(): void {
  const now = Date.now()
  const TTL = 24 * 60 * 60 * 1000

  for (const [uploadId, upload] of activeUploads) {
    if (now - upload.createdAt > TTL) {
      const uploadDir = getUploadDir(uploadId)
      if (fs.existsSync(uploadDir)) {
        fs.rmSync(uploadDir, { recursive: true, force: true })
      }
      activeUploads.delete(uploadId)
    }
  }
}

setInterval(cleanupOldUploads, 60 * 60 * 1000)

export const chunkUploadService = {
  async initiateUpload(
    fileName: string,
    fileSize: number,
    chunkSize: number = 5 * 1024 * 1024
  ): Promise<{ uploadId: string; totalChunks: number; chunkSize: number }> {
    const uploadId = generateUploadId()
    const totalChunks = Math.ceil(fileSize / chunkSize)

    const uploadDir = getUploadDir(uploadId)
    await storageService.ensureDir(uploadDir)

    activeUploads.set(uploadId, {
      uploadId,
      fileName,
      fileSize,
      totalChunks,
      uploadedChunks: [],
      createdAt: Date.now(),
    })

    return { uploadId, totalChunks, chunkSize }
  },

  async uploadChunk(
    uploadId: string,
    chunkNumber: number,
    chunkData: Buffer
  ): Promise<ChunkUploadResult> {
    const upload = activeUploads.get(uploadId)
    if (!upload) {
      throw new Error('上传会话不存在或已过期')
    }

    if (chunkNumber < 0 || chunkNumber >= upload.totalChunks) {
      throw new Error('分片编号无效')
    }

    const uploadDir = getUploadDir(uploadId)
    const chunkPath = path.join(uploadDir, `chunk_${chunkNumber}`)

    fs.writeFileSync(chunkPath, chunkData)

    if (!upload.uploadedChunks.includes(chunkNumber)) {
      upload.uploadedChunks.push(chunkNumber)
      upload.uploadedChunks.sort((a, b) => a - b)
    }

    const progress = (upload.uploadedChunks.length / upload.totalChunks) * 100
    const isComplete = upload.uploadedChunks.length === upload.totalChunks

    let filePath: string | undefined

    if (isComplete) {
      const ext = path.extname(upload.fileName)
      const baseName = path.basename(upload.fileName, ext)
      const finalFileName = `${baseName}_${Date.now()}${ext}`
      const relativePath = path.join('merged', finalFileName)
      const finalPath = path.join(config.storage.uploadDir, relativePath)

      await storageService.ensureDir(path.dirname(finalPath))

      const writeStream = fs.createWriteStream(finalPath)

      for (let i = 0; i < upload.totalChunks; i++) {
        const chunkPath = path.join(uploadDir, `chunk_${i}`)
        const chunkBuffer = fs.readFileSync(chunkPath)
        writeStream.write(chunkBuffer)
      }

      writeStream.end()

      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => resolve())
        writeStream.on('error', reject)
      })

      fs.rmSync(uploadDir, { recursive: true, force: true })
      activeUploads.delete(uploadId)

      filePath = relativePath
    }

    return {
      uploadId,
      complete: isComplete,
      filePath,
      progress,
    }
  },

  getUploadStatus(uploadId: string): ChunkUploadResult {
    const upload = activeUploads.get(uploadId)
    if (!upload) {
      throw new Error('上传会话不存在或已过期')
    }

    const progress = (upload.uploadedChunks.length / upload.totalChunks) * 100

    return {
      uploadId,
      complete: false,
      progress,
    }
  },

  cancelUpload(uploadId: string): void {
    const uploadDir = getUploadDir(uploadId)
    if (fs.existsSync(uploadDir)) {
      fs.rmSync(uploadDir, { recursive: true, force: true })
    }
    activeUploads.delete(uploadId)
  },

  getMissingChunks(uploadId: string): number[] {
    const upload = activeUploads.get(uploadId)
    if (!upload) {
      throw new Error('上传会话不存在或已过期')
    }

    const missing: number[] = []
    for (let i = 0; i < upload.totalChunks; i++) {
      if (!upload.uploadedChunks.includes(i)) {
        missing.push(i)
      }
    }
    return missing
  },
}
