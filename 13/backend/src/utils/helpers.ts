import { v4 as uuidv4 } from 'uuid';

export const generateId = (): string => uuidv4();

export const formatDate = (date: Date): string => {
  return date.toISOString();
};

export const paginate = (
  total: number,
  page: number,
  pageSize: number
) => {
  const totalPages = Math.ceil(total / pageSize);
  return {
    page,
    pageSize,
    total,
    totalPages
  };
};

export const calculateFileChecksum = async (
  filePath: string
): Promise<string> => {
  const crypto = await import('crypto');
  const fs = await import('fs');
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
};

export const deepCompare = (
  obj1: Record<string, any>,
  obj2: Record<string, any>
): Array<{ field: string; oldValue: any; newValue: any }> => {
  const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];
  const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);

  for (const key of allKeys) {
    if (JSON.stringify(obj1[key]) !== JSON.stringify(obj2[key])) {
      changes.push({
        field: key,
        oldValue: obj1[key],
        newValue: obj2[key]
      });
    }
  }

  return changes;
};
