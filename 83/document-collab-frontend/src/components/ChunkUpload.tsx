import React, { useState, useRef, useCallback } from 'react'
import {
  Upload,
  Progress,
  Button,
  Space,
  Card,
  Tag,
  message,
  Alert,
  Descriptions,
  Typography,
} from 'antd'
import {
  UploadOutlined,
  PauseOutlined,
  PlayCircleOutlined,
  CloseOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CloudServerOutlined,
} from '@ant-design/icons'
import SparkMD5 from 'spark-md5'
import { chunkApi, DocumentVersionDTO } from '../api/chunk'
import dayjs from 'dayjs'

const { Text } = Typography

interface ChunkUploadProps {
  documentId: string
  onSuccess?: (version: DocumentVersionDTO) => void
  onCancel?: () => void
  maxChunkSize?: number
  maxConcurrency?: number
  maxRetries?: number
}

type ChunkStatus = 'pending' | 'uploading' | 'success' | 'error' | 'exists'

interface ChunkInfo {
  index: number
  status: ChunkStatus
  progress: number
  retries: number
  blob: Blob
}

const ChunkUpload: React.FC<ChunkUploadProps> = ({
  documentId,
  onSuccess,
  onCancel,
  maxChunkSize = 5 * 1024 * 1024,
  maxConcurrency = 3,
  maxRetries = 3,
}) => {
  const [file, setFile] = useState<File | null>(null)
  const [fileHash, setFileHash] = useState<string>('')
  const [hashProgress, setHashProgress] = useState(0)
  const [uploadId, setUploadId] = useState<string>('')
  const [chunks, setChunks] = useState<ChunkInfo[]>([])
  const [totalChunks, setTotalChunks] = useState(0)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [status, setStatus] = useState<'idle' | 'hashing' | 'checking' | 'uploading' | 'paused' | 'merging' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [mergedVersion, setMergedVersion] = useState<DocumentVersionDTO | null>(null)
  const [changeLog] = useState<string>('')

  const isPausedRef = useRef(false)
  const activeUploadsRef = useRef(0)
  const uploadCancelledRef = useRef(false)

  const calculateFileHash = useCallback(async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const chunkSize = 2097152
      const chunks = Math.ceil(file.size / chunkSize)
      let currentChunk = 0
      const spark = new SparkMD5.ArrayBuffer()
      const fileReader = new FileReader()

      fileReader.onload = (e) => {
        if (uploadCancelledRef.current) {
          reject(new Error('已取消'))
          return
        }
        spark.append(e.target?.result as ArrayBuffer)
        currentChunk++
        setHashProgress(Math.round((currentChunk / chunks) * 100))
        if (currentChunk < chunks) {
          loadNext()
        } else {
          const hash = spark.end()
          resolve(hash)
        }
      }

      fileReader.onerror = () => {
        reject(new Error('文件读取失败'))
      }

      const loadNext = () => {
        const start = currentChunk * chunkSize
        const end = Math.min(start + chunkSize, file.size)
        fileReader.readAsArrayBuffer(file.slice(start, end))
      }

      loadNext()
    })
  }, [])

  const prepareChunks = useCallback((file: File): ChunkInfo[] => {
    const chunks: ChunkInfo[] = []
    const total = Math.ceil(file.size / maxChunkSize)
    for (let i = 0; i < total; i++) {
      const start = i * maxChunkSize
      const end = Math.min(start + maxChunkSize, file.size)
      chunks.push({
        index: i,
        status: 'pending',
        progress: 0,
        retries: 0,
        blob: file.slice(start, end),
      })
    }
    return chunks
  }, [maxChunkSize])

  const checkExistingChunks = useCallback(async () => {
    if (!uploadId || totalChunks === 0) return

    setStatus('checking')
    const updatedChunks = [...chunks]

    for (let i = 0; i < totalChunks; i++) {
      try {
        const res = await chunkApi.checkChunk(documentId, uploadId, i)
        if (res.status === 'CHUNK_UPLOADED' || res.status === 'EXISTS') {
          updatedChunks[i].status = 'exists'
          updatedChunks[i].progress = 100
        }
      } catch {
      }
    }

    setChunks(updatedChunks)
    updateOverallProgress(updatedChunks)
  }, [uploadId, totalChunks, chunks, documentId])

  const updateOverallProgress = useCallback((chunkList: ChunkInfo[]) => {
    if (chunkList.length === 0) {
      setUploadProgress(0)
      return
    }
    const totalProgress = chunkList.reduce((sum, chunk) => sum + chunk.progress, 0)
    const progress = Math.round(totalProgress / chunkList.length)
    setUploadProgress(progress)
  }, [])

  const uploadChunk = useCallback(async (chunk: ChunkInfo): Promise<boolean> => {
    if (!file || uploadCancelledRef.current) return false

    const updateChunkStatus = (index: number, status: ChunkStatus, progress: number) => {
      setChunks((prev) => {
        const updated = [...prev]
        updated[index] = { ...updated[index], status, progress }
        updateOverallProgress(updated)
        return updated
      })
    }

    try {
      updateChunkStatus(chunk.index, 'uploading', 0)

      const res = await chunkApi.uploadChunk(documentId, {
        chunkData: chunk.blob,
        fileName: file.name,
        fileSize: file.size,
        totalChunks,
        chunkIndex: chunk.index,
        chunkSize: maxChunkSize,
        uploadId,
        fileHash,
        mimeType: file.type,
        changeLog: changeLog || undefined,
      })

      if (res.uploadId && !uploadId) {
        setUploadId(res.uploadId)
      }

      updateChunkStatus(chunk.index, 'success', 100)
      return true
    } catch (err) {
      chunk.retries++
      if (chunk.retries < maxRetries && !uploadCancelledRef.current) {
        message.warning(`分片 ${chunk.index + 1} 上传失败，正在重试 (${chunk.retries}/${maxRetries})`)
        return uploadChunk(chunk)
      }
      updateChunkStatus(chunk.index, 'error', 0)
      return false
    }
  }, [file, uploadId, fileHash, totalChunks, maxChunkSize, maxRetries, documentId, changeLog, updateOverallProgress])

  const processQueue = useCallback(async () => {
    if (uploadCancelledRef.current || isPausedRef.current) return

    const pendingChunks = chunks.filter((c) => c.status === 'pending')

    while (pendingChunks.length > 0 && activeUploadsRef.current < maxConcurrency && !isPausedRef.current && !uploadCancelledRef.current) {
      const chunk = pendingChunks.shift()
      if (!chunk) break

      activeUploadsRef.current++
      uploadChunk(chunk).finally(() => {
        activeUploadsRef.current--
        if (!uploadCancelledRef.current && !isPausedRef.current) {
          processQueue()
        }
      })
    }

    const allDone = chunks.every((c) => c.status === 'success' || c.status === 'exists')
    const hasError = chunks.some((c) => c.status === 'error')

    if (allDone && !uploadCancelledRef.current) {
      await mergeChunks()
    } else if (hasError && activeUploadsRef.current === 0) {
      setStatus('error')
      setErrorMessage('部分分片上传失败，请重试')
    }
  }, [chunks, maxConcurrency, uploadChunk])

  const mergeChunks = useCallback(async () => {
    if (!uploadId || uploadCancelledRef.current) return

    setStatus('merging')
    try {
      const res = await chunkApi.mergeChunks(documentId, uploadId)
      if (res.mergedVersion) {
        setMergedVersion(res.mergedVersion)
        setStatus('success')
        message.success('文件上传成功')
        onSuccess?.(res.mergedVersion)
      } else {
        throw new Error('合并失败')
      }
    } catch {
      setStatus('error')
      setErrorMessage('文件合并失败')
    }
  }, [uploadId, documentId, onSuccess])

  const startUpload = useCallback(async (selectedFile: File) => {
    if (selectedFile.size < 10 * 1024 * 1024) {
      message.info('文件小于10MB，建议使用普通上传')
    }

    uploadCancelledRef.current = false
    isPausedRef.current = false
    setFile(selectedFile)
    setStatus('hashing')
    setHashProgress(0)
    setErrorMessage('')
    setMergedVersion(null)

    try {
      const hash = await calculateFileHash(selectedFile)
      setFileHash(hash)

      const preparedChunks = prepareChunks(selectedFile)
      setChunks(preparedChunks)
      setTotalChunks(preparedChunks.length)

      try {
        const initialRes = await chunkApi.uploadChunk(documentId, {
          chunkData: preparedChunks[0].blob,
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          totalChunks: preparedChunks.length,
          chunkIndex: 0,
          chunkSize: maxChunkSize,
          fileHash: hash,
          mimeType: selectedFile.type,
          changeLog: changeLog || undefined,
        })

        if (initialRes.status === 'EXISTS') {
          setStatus('success')
          if (initialRes.mergedVersion) {
            setMergedVersion(initialRes.mergedVersion)
          }
          message.success('文件已存在，上传完成')
          onSuccess?.(initialRes.mergedVersion!)
          return
        }

        if (initialRes.uploadId) {
          setUploadId(initialRes.uploadId)
        }

        preparedChunks[0].status = 'success'
        preparedChunks[0].progress = 100
        setChunks([...preparedChunks])

        if (initialRes.uploadId) {
          setUploadId(initialRes.uploadId)
          await checkExistingChunks()
        }

        setStatus('uploading')
        processQueue()
      } catch {
        setStatus('error')
        setErrorMessage('上传初始化失败')
      }
    } catch (err: any) {
      if (err.message !== '已取消') {
        setStatus('error')
        setErrorMessage(err.message || '文件处理失败')
      }
    }
  }, [calculateFileHash, prepareChunks, checkExistingChunks, processQueue, documentId, maxChunkSize, changeLog, onSuccess])

  const handlePause = () => {
    isPausedRef.current = true
    setStatus('paused')
  }

  const handleResume = () => {
    isPausedRef.current = false
    setStatus('uploading')
    processQueue()
  }

  const handleCancel = () => {
    uploadCancelledRef.current = true
    if (uploadId) {
      chunkApi.cancelUpload(documentId, uploadId).catch(() => {})
    }
    setStatus('idle')
    setFile(null)
    setFileHash('')
    setChunks([])
    setTotalChunks(0)
    setUploadProgress(0)
    setUploadId('')
    setHashProgress(0)
    setErrorMessage('')
    setMergedVersion(null)
    onCancel?.()
  }

  const handleRetry = () => {
    setStatus('uploading')
    isPausedRef.current = false
    uploadCancelledRef.current = false
    setChunks((prev) =>
      prev.map((c) =>
        c.status === 'error' ? { ...c, status: 'pending', retries: 0 } : c
      )
    )
    processQueue()
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const getStatusText = () => {
    switch (status) {
      case 'hashing': return `正在计算文件哈希 (${hashProgress}%)`
      case 'checking': return '正在检查已上传分片...'
      case 'uploading': return `正在上传 (${uploadProgress}%)`
      case 'paused': return '已暂停'
      case 'merging': return '正在合并分片...'
      case 'success': return '上传完成'
      case 'error': return '上传失败'
      default: return ''
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case 'success': return 'success'
      case 'error': return 'error'
      case 'paused': return 'warning'
      default: return 'processing'
    }
  }

  const successCount = chunks.filter((c) => c.status === 'success' || c.status === 'exists').length
  const errorCount = chunks.filter((c) => c.status === 'error').length
  const uploadingCount = chunks.filter((c) => c.status === 'uploading').length

  return (
    <div>
      {status === 'idle' && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">支持大于10MB的文件上传，自动分片处理，支持断点续传</Text>
          </div>
          <Upload
            beforeUpload={(file) => {
              startUpload(file)
              return false
            }}
            showUploadList={false}
            accept=".docx,.pdf,.txt,.md,.xlsx,.pptx"
          >
            <Button
              type="primary"
              icon={<UploadOutlined />}
              size="large"
              style={{ background: '#1e3a5f', borderRadius: 6 }}
            >
              选择文件上传
            </Button>
          </Upload>
        </div>
      )}

      {status !== 'idle' && file && (
        <Card style={{ borderRadius: 12, border: '1px solid #e8ecf1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#1e3a5f', marginBottom: 4 }}>
                {file.name}
              </div>
              <div style={{ color: '#666', fontSize: 13 }}>
                {formatFileSize(file.size)} · {totalChunks} 个分片 · 每片 {formatFileSize(maxChunkSize)}
              </div>
            </div>
            <Tag color={getStatusColor()} style={{ borderRadius: 4 }}>
              {getStatusText()}
            </Tag>
          </div>

          {status === 'hashing' && (
            <Progress percent={hashProgress} status="active" showInfo style={{ marginBottom: 16 }} />
          )}

          {(status === 'uploading' || status === 'paused' || status === 'merging' || status === 'error') && (
            <>
              <Progress
                percent={uploadProgress}
                status={status === 'error' ? 'exception' : 'active'}
                style={{ marginBottom: 12 }}
              />
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {chunks.map((chunk) => (
                  <div
                    key={chunk.index}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      color: '#fff',
                      background:
                        chunk.status === 'success' ? '#52c41a' :
                        chunk.status === 'exists' ? '#1890ff' :
                        chunk.status === 'uploading' ? '#1890ff' :
                        chunk.status === 'error' ? '#ff4d4f' :
                        '#d9d9d9',
                      animation: chunk.status === 'uploading' ? 'pulse 1s infinite' : 'none',
                    }}
                    title={`分片 ${chunk.index + 1}: ${chunk.status}`}
                  >
                    {chunk.status === 'success' || chunk.status === 'exists' ? (
                      <CheckCircleOutlined style={{ fontSize: 12 }} />
                    ) : chunk.status === 'error' ? (
                      <ExclamationCircleOutlined style={{ fontSize: 12 }} />
                    ) : (
                      chunk.index + 1
                    )}
                  </div>
                ))}
              </div>
              <div style={{ color: '#999', fontSize: 12, marginBottom: 16 }}>
                <Space size="middle">
                  <span><CloudServerOutlined /> 已完成: {successCount}/{totalChunks}</span>
                  {uploadingCount > 0 && <span>上传中: {uploadingCount}</span>}
                  {errorCount > 0 && <span style={{ color: '#ff4d4f' }}>失败: {errorCount}</span>}
                </Space>
              </div>
            </>
          )}

          {errorMessage && (
            <Alert
              message="上传出错"
              description={errorMessage}
              type="error"
              showIcon
              style={{ marginBottom: 16, borderRadius: 6 }}
            />
          )}

          {status === 'success' && mergedVersion && (
            <Alert
              message="上传成功"
              type="success"
              showIcon
              style={{ marginBottom: 16, borderRadius: 6 }}
            />
          )}

          {mergedVersion && (
            <Descriptions
              bordered
              size="small"
              column={1}
              style={{ marginBottom: 16 }}
              labelStyle={{ background: '#fafafa', color: '#666', width: 100 }}
            >
              <Descriptions.Item label="版本号">v{mergedVersion.versionNumber}</Descriptions.Item>
              <Descriptions.Item label="文件大小">{formatFileSize(mergedVersion.fileSize)}</Descriptions.Item>
              <Descriptions.Item label="上传时间">{dayjs(mergedVersion.createdAt).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
              <Descriptions.Item label="文件哈希">{fileHash}</Descriptions.Item>
            </Descriptions>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {fileHash && status !== 'hashing' && (
              <Text type="secondary" copyable={{ text: fileHash }} style={{ fontSize: 12 }}>
                MD5: {fileHash.substring(0, 16)}...
              </Text>
            )}
            <Space>
              {(status === 'uploading') && (
                <Button
                  icon={<PauseOutlined />}
                  onClick={handlePause}
                  style={{ borderRadius: 6 }}
                >
                  暂停
                </Button>
              )}
              {status === 'paused' && (
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={handleResume}
                  style={{ background: '#1e3a5f', borderRadius: 6 }}
                >
                  继续
                </Button>
              )}
              {status === 'error' && (
                <Button
                  type="primary"
                  onClick={handleRetry}
                  style={{ background: '#1e3a5f', borderRadius: 6 }}
                >
                  重试
                </Button>
              )}
              {status !== 'success' && (
                <Button
                  danger
                  icon={<CloseOutlined />}
                  onClick={handleCancel}
                  style={{ borderRadius: 6 }}
                >
                  取消
                </Button>
              )}
              {status === 'success' && (
                <Button
                  type="primary"
                  onClick={handleCancel}
                  style={{ background: '#1e3a5f', borderRadius: 6 }}
                >
                  关闭
                </Button>
              )}
            </Space>
          </div>
        </Card>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}

export default ChunkUpload
