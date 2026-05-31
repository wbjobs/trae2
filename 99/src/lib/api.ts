import type {
  Borehole,
  BoreholeLayer,
  GeoLayer,
  Annotation,
  DEMData,
  CoordinateSystem,
} from '@/types';

const BASE_URL = '/api';

interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface ListParams {
  page?: number;
  pageSize?: number;
}

interface BoreholeListParams extends ListParams {
  keyword?: string;
  coordinateSystem?: string;
}

interface LayerListParams extends ListParams {
  type?: string;
}

interface AnnotationListParams extends ListParams {
  type?: string;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `API Error: ${response.status}`);
  }

  return response.json();
}

export const boreholeApi = {
  list: (params?: BoreholeListParams) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    if (params?.keyword) query.set('keyword', params.keyword);
    if (params?.coordinateSystem) query.set('coordinateSystem', params.coordinateSystem);
    
    return request<PaginatedResponse<Borehole>>(`/boreholes?${query.toString()}`);
  },

  getById: (id: string) => request<Borehole>(`/boreholes/${id}`),

  create: (data: Omit<Borehole, 'id' | 'layers'>) =>
    request<Borehole>('/boreholes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<Omit<Borehole, 'id' | 'layers'>>) =>
    request<Borehole>(`/boreholes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<void>(`/boreholes/${id}`, { method: 'DELETE' }),

  getLayers: (boreholeId: string) =>
    request<BoreholeLayer[]>(`/boreholes/${boreholeId}/layers`),

  addLayer: (boreholeId: string, data: Omit<BoreholeLayer, 'id' | 'boreholeId'>) =>
    request<BoreholeLayer>(`/boreholes/${boreholeId}/layers`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateLayer: (boreholeId: string, layerId: string, data: Partial<Omit<BoreholeLayer, 'id' | 'boreholeId'>>) =>
    request<BoreholeLayer>(`/boreholes/${boreholeId}/layers/${layerId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteLayer: (boreholeId: string, layerId: string) =>
    request<void>(`/boreholes/${boreholeId}/layers/${layerId}`, { method: 'DELETE' }),
};

export const geoLayerApi = {
  list: (params?: LayerListParams) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    if (params?.type) query.set('type', params.type);
    
    return request<PaginatedResponse<GeoLayer>>(`/layers?${query.toString()}`);
  },

  getById: (id: string) => request<GeoLayer>(`/layers/${id}`),

  create: (data: Omit<GeoLayer, 'id'>) =>
    request<GeoLayer>('/layers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<Omit<GeoLayer, 'id'>>) =>
    request<GeoLayer>(`/layers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<void>(`/layers/${id}`, { method: 'DELETE' }),
};

export const coordinateApi = {
  listSystems: () => request<CoordinateSystem[]>('/coordinate/systems'),

  transform: (coords: [number, number], from: string, to: string) =>
    request<{ coords: [number, number] }>('/coordinate/transform', {
      method: 'POST',
      body: JSON.stringify({ coords, from, to }),
    }),
};

export const annotationApi = {
  list: (params?: AnnotationListParams) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    if (params?.type) query.set('type', params.type);
    
    return request<PaginatedResponse<Annotation>>(`/annotations?${query.toString()}`);
  },

  getById: (id: string) => request<Annotation>(`/annotations/${id}`),

  create: (data: Omit<Annotation, 'id' | 'createdAt'>) =>
    request<Annotation>('/annotations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<Omit<Annotation, 'id' | 'createdAt'>>) =>
    request<Annotation>(`/annotations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<void>(`/annotations/${id}`, { method: 'DELETE' }),
};

export const terrainApi = {
  getDEM: () => request<DEMData>('/terrain/dem'),
};

export type { PaginatedResponse, BoreholeListParams, LayerListParams, AnnotationListParams };
