import { create } from 'zustand';
import type {
  MonitoringStation,
  WaterQualityData,
  NutrientData,
  PlanktonData,
  FusedMonitoringData,
  PaginatedResponse,
  PaginationParams,
  DashboardStats,
} from '@/types';
import {
  getStations,
  getWaterQualityData,
  getNutrientData,
  getPlanktonData,
  getFusedMonitoringData,
  getDashboardStats,
} from '@/api';

interface DataState {
  stations: MonitoringStation[];
  waterQualityData: PaginatedResponse<WaterQualityData> | null;
  nutrientData: PaginatedResponse<NutrientData> | null;
  planktonData: PaginatedResponse<PlanktonData> | null;
  fusedData: PaginatedResponse<FusedMonitoringData> | null;
  dashboardStats: DashboardStats | null;
  loading: boolean;
  error: string | null;
  fetchStations: () => Promise<void>;
  fetchWaterQuality: (params: PaginationParams) => Promise<void>;
  fetchNutrient: (params: PaginationParams) => Promise<void>;
  fetchPlankton: (params: PaginationParams) => Promise<void>;
  fetchFusedData: (params: PaginationParams) => Promise<void>;
  fetchDashboardStats: () => Promise<void>;
  clearAll: () => void;
}

export const useDataStore = create<DataState>((set) => ({
  stations: [],
  waterQualityData: null,
  nutrientData: null,
  planktonData: null,
  fusedData: null,
  dashboardStats: null,
  loading: false,
  error: null,

  fetchStations: async () => {
    set({ loading: true, error: null });
    try {
      const data = await getStations();
      set({ stations: data });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch stations' });
    } finally {
      set({ loading: false });
    }
  },

  fetchWaterQuality: async (params: PaginationParams) => {
    set({ loading: true, error: null });
    try {
      const data = await getWaterQualityData(params);
      set({ waterQualityData: data });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch water quality data' });
    } finally {
      set({ loading: false });
    }
  },

  fetchNutrient: async (params: PaginationParams) => {
    set({ loading: true, error: null });
    try {
      const data = await getNutrientData(params);
      set({ nutrientData: data });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch nutrient data' });
    } finally {
      set({ loading: false });
    }
  },

  fetchPlankton: async (params: PaginationParams) => {
    set({ loading: true, error: null });
    try {
      const data = await getPlanktonData(params);
      set({ planktonData: data });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch plankton data' });
    } finally {
      set({ loading: false });
    }
  },

  fetchFusedData: async (params: PaginationParams) => {
    set({ loading: true, error: null });
    try {
      const data = await getFusedMonitoringData(params);
      set({ fusedData: data });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch fused data' });
    } finally {
      set({ loading: false });
    }
  },

  fetchDashboardStats: async () => {
    set({ loading: true, error: null });
    try {
      const data = await getDashboardStats();
      set({ dashboardStats: data });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch dashboard stats' });
    } finally {
      set({ loading: false });
    }
  },

  clearAll: () => {
    set({
      stations: [],
      waterQualityData: null,
      nutrientData: null,
      planktonData: null,
      fusedData: null,
      dashboardStats: null,
      loading: false,
      error: null,
    });
  },
}));
