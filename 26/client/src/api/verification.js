import request from '@/utils/request'

export const getVerifications = (params) => request.get('/verification', { params })
export const getMyVerifications = () => request.get('/verification/my')
export const getVerification = (id) => request.get(`/verification/${id}`)
export const submitVerification = (data) => request.post('/verification', data)
export const auditVerification = (id, data) => request.put(`/verification/${id}/audit`, data)
export const thirdPartyVerify = (data) => request.post('/verification/third-party-verify', data)
