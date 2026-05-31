import { create } from 'zustand';
import type { PaginationParams } from '@/types';

interface FilterState {
  dateRange: [string, string];
  stationIds: string[];
  species: string[];
  categories: string[];
  indicators: string[];
  page: number;
  pageSize: number;
  setDateRange: (range: [string, string]) => void;
  setStationIds: (ids: string[]) => void;
  toggleStationId: (id: string) => void;
  setSpecies: (species: string[]) => void;
  setCategories: (categories: string[]) => void;
  setIndicators: (indicators: string[]) => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  resetFilters: () => void;
  getPaginationParams: () => PaginationParams;
}

const defaultDateRange: [string, string] = ['', ''];

export const useFilterStore = create<FilterState>((set, get) => ({
  dateRange: defaultDateRange,
  stationIds: [],
  species: [],
  categories: [],
  indicators: [],
  page: 1,
  pageSize: 10,

  setDateRange: (range: [string, string]) => {
    set({ dateRange: range, page: 1 });
  },

  setStationIds: (ids: string[]) => {
    set({ stationIds: ids, page: 1 });
  },

  toggleStationId: (id: string) => {
    const { stationIds } = get();
    const newIds = stationIds.includes(id)
      ? stationIds.filter((s) => s !== id)
      : [...stationIds, id];
    set({ stationIds: newIds, page: 1 });
  },

  setSpecies: (species: string[]) => {
    set({ species, page: 1 });
  },

  setCategories: (categories: string[]) => {
    set({ categories, page: 1 });
  },

  setIndicators: (indicators: string[]) => {
    set({ indicators, page: 1 });
  },

  setPage: (page: number) => {
    set({ page });
  },

  setPageSize: (size: number) => {
    set({ pageSize: size, page: 1 });
  },

  resetFilters: () => {
    set({
      dateRange: defaultDateRange,
      stationIds: [],
      species: [],
      categories: [],
      indicators: [],
      page: 1,
      pageSize: 10,
    });
  },

  getPaginationParams: (): PaginationParams => {
    const { dateRange, stationIds, page, pageSize } = get();
    return {
      page,
      pageSize,
      startTime: dateRange[0] || undefined,
      endTime: dateRange[1] || undefined,
      stationId: stationIds.length === 1 ? stationIds[0] : undefined,
    };
  },
}));
