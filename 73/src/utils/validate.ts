import dayjs from 'dayjs';

export function isValidNumber(val: unknown): boolean {
  return typeof val === 'number' && isFinite(val) && !isNaN(val);
}

export function isValidDate(val: string): boolean {
  if (!val) return false;
  return dayjs(val).isValid();
}

export function isValidStationId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && /^[A-Za-z0-9-]+$/.test(id);
}

export function isInRange(val: number, min: number, max: number): boolean {
  return isValidNumber(val) && val >= min && val <= max;
}
