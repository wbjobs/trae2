export interface RadarDevice {
  id: string;
  ip: string;
  status: 'online' | 'offline' | 'busy';
  lastHeartbeat?: number;
}

export interface AppConfig {
  port: number;
  env: string;
  jwt: {
    secret: string;
    expiresIn: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  api: {
    rateLimit: number;
    timeout: number;
  };
  radarDevices: RadarDevice[];
  callbackBaseUrl: string;
  logging: {
    level: string;
    file: string;
  };
}

const parseRadarDevices = (devicesStr: string): RadarDevice[] => {
  if (!devicesStr) return [];
  return devicesStr.split(',').map((item) => {
    const [id, ip] = item.split(':');
    return { id, ip, status: 'offline' };
  });
};

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  env: process.env.NODE_ENV || 'development',
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  api: {
    rateLimit: parseInt(process.env.API_RATE_LIMIT || '1000', 10),
    timeout: parseInt(process.env.API_TIMEOUT || '30000', 10),
  },
  radarDevices: parseRadarDevices(process.env.RADAR_DEVICES || ''),
  callbackBaseUrl: process.env.CALLBACK_BASE_URL || 'http://localhost:3000',
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log',
  },
};
