export class StatCalculator {
  static mean(values: number[]): number {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  static variance(values: number[], mean: number): number {
    return values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  }

  static std(values: number[], mean: number): number {
    return Math.sqrt(this.variance(values, mean));
  }

  static quantile(sorted: number[], q: number): number {
    const idx = Math.floor(sorted.length * q);
    return sorted[Math.min(idx, sorted.length - 1)] || 0;
  }

  static rms(values: number[]): number {
    return Math.sqrt(values.reduce((a, b) => a + b * b, 0) / values.length);
  }

  static volatility(values: number[], mean: number, std: number): number {
    const range = Math.max(...values) - Math.min(...values);
    return range > 0 && mean > 0 ? std / mean : 0;
  }

  static computeAll(values: number[]): {
    mean: number; std: number; max: number; min: number;
    q1: number; median: number; q3: number; rms: number; volatility: number;
  } {
    const m = this.mean(values);
    const s = this.std(values, m);
    const sorted = [...values].sort((a, b) => a - b);
    return {
      mean: Math.round(m * 100) / 100,
      std: Math.round(s * 100) / 100,
      max: Math.round(Math.max(...values) * 100) / 100,
      min: Math.round(Math.min(...values) * 100) / 100,
      q1: Math.round(this.quantile(sorted, 0.25) * 100) / 100,
      median: Math.round(this.quantile(sorted, 0.5) * 100) / 100,
      q3: Math.round(this.quantile(sorted, 0.75) * 100) / 100,
      rms: Math.round(this.rms(values) * 100) / 100,
      volatility: Math.round(this.volatility(values, m, s) * 100) / 100
    };
  }
}
