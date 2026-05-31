import request from '@/utils/request'

export const getSignatures = (params) => request.get('/signatures', { params })
export const getSignature = (id) => request.get(`/signatures/${id}`)
export const createSignature = (data) => request.post('/signatures', data)
export const verifySignature = (data) => request.post('/signatures/verify', data)
export const revokeSignature = (id) => request.put(`/signatures/${id}/revoke`)
export const getArchiveSignatures = (archiveId) => request.get(`/signatures/archive/${archiveId}`)
export const getSignatureStats = () => request.get('/signatures/stats/summary')
