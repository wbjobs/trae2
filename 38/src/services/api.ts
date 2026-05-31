import { GeologyLayer, QueryResult } from '../types';

const API_BASE_URL = '/api';

export async function getGeologyLayers(): Promise<GeologyLayer[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/geology/layers`);
    const data = await response.json();
    if (data.success) {
      return data.data;
    }
    throw new Error(data.error || 'Failed to fetch geology layers');
  } catch (error) {
    console.error('Error fetching geology layers:', error);
    throw error;
  }
}

export async function getGeologyLayerById(id: string): Promise<GeologyLayer> {
  try {
    const response = await fetch(`${API_BASE_URL}/geology/layers/${id}`);
    const data = await response.json();
    if (data.success) {
      return data.data;
    }
    throw new Error(data.error || 'Failed to fetch geology layer');
  } catch (error) {
    console.error('Error fetching geology layer:', error);
    throw error;
  }
}

export async function queryRockInfo(
  x: number,
  y: number,
  z: number
): Promise<QueryResult | null> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/geology/query/rock-info?x=${x}&y=${y}&z=${z}`
    );
    const data = await response.json();
    if (data.success) {
      return data.data;
    }
    return null;
  } catch (error) {
    console.error('Error querying rock info:', error);
    return null;
  }
}

export async function queryRegionData(bounds: any): Promise<{
  layers: GeologyLayer[];
  bounds: any;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/geology/query/region`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bounds }),
    });
    const data = await response.json();
    if (data.success) {
      return data.data;
    }
    throw new Error(data.error || 'Failed to query region data');
  } catch (error) {
    console.error('Error querying region data:', error);
    throw error;
  }
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('API health check failed:', error);
    return false;
  }
}
