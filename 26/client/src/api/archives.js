import request from '@/utils/request'

export const getArchives = (params) => request.get('/archives', { params })
export const getArchive = (id) => request.get(`/archives/${id}`)
export const createArchive = (data) => request.post('/archives', data)
export const updateArchive = (id, data) => request.put(`/archives/${id}`, data)
export const deleteArchive = (id) => request.delete(`/archives/${id}`)
export const addCraftStep = (id, data) => request.post(`/archives/${id}/craft-steps`, data)
export const getCraftSteps = (id) => request.get(`/archives/${id}/craft-steps`)
export const getArchiveCategories = () => request.get('/archives/options/categories')
export const getArchiveStats = () => request.get('/archives/stats/summary')
