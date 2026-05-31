import request from '@/utils/request'

export const getWarnings = (params) => request.get('/warnings', { params })
export const getWarningStats = () => request.get('/warnings/stats')
export const getWarning = (id) => request.get(`/warnings/${id}`)
export const createWarning = (data) => request.post('/warnings', data)
export const resolveWarning = (id, data) => request.put(`/warnings/${id}/resolve`, data)
export const deleteWarning = (id) => request.delete(`/warnings/${id}`)
export const checkTransferWarnings = () => request.post('/warnings/check-transfers')
