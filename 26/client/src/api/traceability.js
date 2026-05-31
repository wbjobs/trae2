import request from '@/utils/request'

export const getTraceability = (archiveId) => request.get(`/traceability/${archiveId}`)
export const getChain = (archiveId) => request.get(`/traceability/chain/${archiveId}`)
export const verifyChain = (archiveId) => request.get(`/traceability/verify-chain/${archiveId}`)
