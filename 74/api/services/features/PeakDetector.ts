export class PeakDetector {
  static detect(values: number[], threshold: number): number[] {
    const peaks: number[] = [];
    for (let i = 1; i < values.length - 1; i++) {
      if (values[i] > threshold && values[i] > values[i - 1] && values[i] > values[i + 1]) {
        peaks.push(i);
      }
    }
    return peaks;
  }

  static count(values: number[], mean: number, std: number): number {
    const threshold = mean + std * 2;
    return this.detect(values, threshold).length;
  }

  static detectWithIndices(values: number[], mean: number, std: number): { index: number; value: number }[] {
    const threshold = mean + std * 2;
    return this.detect(values, threshold).map(i => ({ index: i, value: values[i] }));
  }
}
