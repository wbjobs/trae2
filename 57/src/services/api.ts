import axios from 'axios';
import type { BridgeModel, DefectData, Layer, StressResult } from '../../shared';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

export const bridgeApi = {
  getAllBridges: (): Promise<BridgeModel[]> =>
    api.get('/bridges').then((res) => res.data),

  getBridge: (id: string): Promise<BridgeModel> =>
    api.get(`/bridges/${id}`).then((res) => res.data),

  getDefects: (bridgeId: string): Promise<DefectData[]> =>
    api.get(`/bridges/${bridgeId}/defects`).then((res) => res.data),

  createDefect: (defect: Omit<DefectData, 'id' | 'detectedAt'>): Promise<DefectData> =>
    api.post('/defects', defect).then((res) => res.data),

  updateDefect: (id: string, updates: Partial<DefectData>): Promise<DefectData> =>
    api.put(`/defects/${id}`, updates).then((res) => res.data),

  deleteDefect: (id: string): Promise<void> =>
    api.delete(`/defects/${id}`),

  getLayers: (bridgeId: string): Promise<Layer[]> =>
    api.get(`/bridges/${bridgeId}/layers`).then((res) => res.data),

  createLayer: (layer: Omit<Layer, 'id'>): Promise<Layer> =>
    api.post('/layers', layer).then((res) => res.data),

  updateLayer: (id: string, updates: Partial<Layer>): Promise<Layer> =>
    api.put(`/layers/${id}`, updates).then((res) => res.data),

  getStressResults: (bridgeId: string): Promise<StressResult[]> =>
    api.get(`/bridges/${bridgeId}/stress`).then((res) => res.data),
};
