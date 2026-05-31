import request from '@/utils/request'

export const getDashboard = () => request.get('/dashboard/overview')
export const getTrend = (params) => request.get('/dashboard/stats/trend', { params })
export const getLogs = (params) => request.get('/dashboard/logs', { params })
