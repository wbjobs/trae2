import request from '@/utils/request'

export const getMaterials = (params) => request.get('/materials', { params })
export const getMaterial = (id) => request.get(`/materials/${id}`)
export const createMaterial = (data) => request.post('/materials', data)
export const updateMaterial = (id, data) => request.put(`/materials/${id}`, data)
export const deleteMaterial = (id) => request.delete(`/materials/${id}`)
export const batchCreateMaterials = (data) => request.post('/materials/batch', data)
export const importMaterials = (file) => request.post('/materials/import', { file })
export const getTemplate = () => request.get('/materials/export/template')
export const exportMaterialData = (params) => request.get('/materials/export/data', { params })
export const useMaterial = (id, data) => request.post(`/materials/${id}/usage`, data)
export const getMaterialStats = () => request.get('/materials/stats/summary')
