export const DATABASE_NAME = 'signaling_db';
export const TABLE_NAME = 'signaling_messages';

export const SIGNALING_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS ${DATABASE_NAME}.${TABLE_NAME} (
    id String,
    timestamp DateTime64(3),
    device_id String,
    device_name String,
    signaling_type String,
    protocol String,
    source_ip String,
    dest_ip String,
    source_port UInt16,
    dest_port UInt16,
    payload String,
    length UInt32,
    status String,
    raw_data String,
    hash String,
    created_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (device_id, timestamp, signaling_type)
PARTITION BY toYYYYMM(timestamp)
SETTINGS index_granularity = 8192;
`;

export const CREATE_DATABASE_DDL = `
CREATE DATABASE IF NOT EXISTS ${DATABASE_NAME};
`;

export interface SignalingMessage {
    id: string;
    timestamp: string;
    device_id: string;
    device_name: string;
    signaling_type: string;
    protocol: string;
    source_ip: string;
    dest_ip: string;
    source_port: number;
    dest_port: number;
    payload: string;
    length: number;
    status: string;
    raw_data: string;
    hash: string;
    created_at?: string;
}

export interface QueryFilters {
    deviceId?: string;
    deviceName?: string;
    signalingType?: string | string[];
    protocol?: string;
    sourceIp?: string;
    destIp?: string;
    status?: string;
    minLength?: number;
    maxLength?: number;
}

export interface QueryOptions {
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDirection?: 'ASC' | 'DESC';
}

export interface MetricsData {
    timestamp: string;
    count: number;
    signaling_type?: string;
    device_id?: string;
}

export interface DeviceStats {
    device_id: string;
    device_name: string;
    message_count: number;
    last_seen: string;
}

export interface TypeDistribution {
    signaling_type: string;
    count: number;
    percentage: number;
}
