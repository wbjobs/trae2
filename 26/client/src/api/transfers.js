import request from '@/utils/request'

export const getTransfers = (params) => request.get('/transfers', { params })
export const getTransfer = (id) => request.get(`/transfers/${id}`)
export const createTransfer = (data) => request.post('/transfers', data)
export const updateTransfer = (id, data) => request.put(`/transfers/${id}`, data)
export const deleteTransfer = (id) => request.delete(`/transfers/${id}`)
export const getArchiveTransfers = (archiveId) => request.get(`/transfers/archive/${archiveId}`)
export const getTimeline = (params) => request.get('/transfers/stats/timeline', { params })
