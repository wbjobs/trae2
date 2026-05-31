export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delayMs: number = 1000,
  shouldRetry?: (error: Error) => boolean
): Promise<T> {
  return fn().catch(async (error) => {
    if (retries <= 0 || (shouldRetry && !shouldRetry(error))) {
      throw error;
    }
    await sleep(delayMs);
    return withRetry(fn, retries - 1, delayMs * 2, shouldRetry);
  });
}

export function calculateRate(count: number, startTime: number, now: number = Date.now()): number {
  const elapsedSeconds = (now - startTime) / 1000;
  if (elapsedSeconds <= 0) return 0;
  return Math.round((count / elapsedSeconds) * 100) / 100;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export function safeJSONParse<T = unknown>(str: string, fallback?: T): T | undefined {
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

export function validateParsedMessage(message: unknown): boolean {
  if (typeof message !== 'object' || message === null) return false;
  const msg = message as Record<string, unknown>;
  return (
    typeof msg.id === 'string' &&
    typeof msg.timestamp === 'number' &&
    typeof msg.type === 'string' &&
    typeof msg.source === 'string' &&
    typeof msg.destination === 'string'
  );
}

export function validateMetricsData(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.id === 'string' &&
    typeof d.timestamp === 'number' &&
    typeof d.service === 'string' &&
    typeof d.metricType === 'string' &&
    typeof d.value === 'number'
  );
}
