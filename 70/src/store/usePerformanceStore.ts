import { create } from 'zustand';
import { PERFORMANCE_CONFIG, PerformanceLevel } from '../../shared/types';

interface PerformanceState {
  level: PerformanceLevel;
  config: typeof PERFORMANCE_CONFIG.high;
  setLevel: (level: PerformanceLevel) => void;
  togglePostProcessing: () => void;
  toggleShadows: () => void;
  setParticleMultiplier: (multiplier: number) => void;
}

export const usePerformanceStore = create<PerformanceState>((set, get) => ({
  level: 'medium',
  config: PERFORMANCE_CONFIG.medium,
  
  setLevel: (level: PerformanceLevel) => {
    set({
      level,
      config: { ...PERFORMANCE_CONFIG[level] },
    });
  },
  
  togglePostProcessing: () => {
    const current = get().config;
    set({
      config: { ...current, postProcessing: !current.postProcessing },
    });
  },
  
  toggleShadows: () => {
    const current = get().config;
    set({
      config: { ...current, shadows: !current.shadows },
    });
  },
  
  setParticleMultiplier: (multiplier: number) => {
    const current = get().config;
    set({
      config: { ...current, particleMultiplier: Math.max(0.1, Math.min(2, multiplier)) },
    });
  },
}));
