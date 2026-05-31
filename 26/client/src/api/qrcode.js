import request from '@/utils/request'

export const generateSingleQR = (archiveId, params) => request.get(`/qrcode/single/${archiveId}`, { params })
export const generateBatchQR = (data) => request.post('/qrcode/batch', data)
export const downloadQR = (archiveId) => request.get(`/qrcode/download/${archiveId}`)
export const getVerifyQR = (archiveId) => request.get(`/qrcode/verify/${archiveId}`)
