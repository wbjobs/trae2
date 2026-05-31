import axios from 'axios';
import type { OpticalElement, SimulationConfig, SimulationResult, ElementType, BatchConfig, BatchComparisonResult } from '../types';

const API_BASE_URL = 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const apiService = {
  async healthCheck(): Promise<boolean> {
    try {
      await api.get('/api/health');
      return true;
    } catch {
      return false;
    }
  },

  async getElementTypes(): Promise<ElementType[]> {
    const response = await api.get('/api/elements/types');
    return response.data.data;
  },

  async getTemplate(templateName: string): Promise<any> {
    const response = await api.get(`/api/templates/${templateName}`);
    return response.data.data;
  },

  async parseParameters(content: string, fileType: string): Promise<any> {
    const response = await api.post('/api/parse/parameters', {
      file_content: content,
      file_type: fileType,
    });
    return response.data.data;
  },

  async uploadParameters(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/api/parse/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.data;
  },

  async simulateRayTracing(config: SimulationConfig): Promise<SimulationResult> {
    const response = await api.post('/api/simulate/ray', config);
    return response.data.data;
  },

  async simulateRayTracingWithRecording(config: SimulationConfig): Promise<SimulationResult> {
    const response = await api.post('/api/simulate/ray', {
      ...config,
      enable_recording: true,
    });
    return response.data.data;
  },

  async simulateInterference(config: SimulationConfig): Promise<SimulationResult> {
    const response = await api.post('/api/simulate/interference', config);
    return response.data.data;
  },

  async batchCompare(configs: BatchConfig[]): Promise<BatchComparisonResult> {
    const response = await api.post('/api/simulate/batch', { configs });
    return response.data.data;
  },

  async getPerformanceInfo(): Promise<any> {
    const response = await api.get('/api/simulate/performance');
    return response.data.data;
  },

  async generateReport(simulationResults: any, elementData: OpticalElement[]): Promise<Blob> {
    const response = await api.post(
      '/api/report/generate',
      {
        simulation_results: simulationResults,
        element_data: elementData,
      },
      {
        responseType: 'blob',
      }
    );
    return response.data;
  },
};

export default apiService;
