export enum ProtocolType {
  S7_COMM = 's7_comm',
  MODBUS_TCP = 'modbus_tcp',
  MQTT = 'mqtt',
  OPC_UA = 'opc_ua',
  DNP3 = 'dnp3',
  IEC_104 = 'iec_104',
  UNKNOWN = 'unknown'
}

export enum PacketDirection {
  REQUEST = 'request',
  RESPONSE = 'response',
  UNKNOWN = 'unknown'
}

export interface NetworkPacket {
  id: string;
  timestamp: number;
  protocol: ProtocolType;
  sourceIp: string;
  sourcePort: number;
  destinationIp: string;
  destinationPort: number;
  length: number;
  rawData: string;
  direction: PacketDirection;
  interfaceId: string;
}

export interface ParsedPacket extends NetworkPacket {
  parsedData: Record<string, any>;
  parsingSuccess: boolean;
  parsingError?: string;
}

export interface CaptureStatus {
  interfaceId: string;
  isRunning: boolean;
  packetsCaptured: number;
  startTime?: number;
  endTime?: number;
}

export interface DeviceInfo {
  id: string;
  name: string;
  type: string;
  ip: string;
  protocols: ProtocolType[];
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface RawPacket {
  id: string;
  sourceId: string;
  timestamp: number;
  protocol: 'tcp' | 'udp' | 'http' | 'https' | 'sip' | 'rtp' | 'other';
  srcIp: string;
  srcPort: number;
  dstIp: string;
  dstPort: number;
  payload: string;
  payloadLength: number;
  headers?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface ParsedMessage {
  id: string;
  packetId: string;
  sourceId: string;
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
  protocol: string;
}

export interface QueueMetricsData {
  sourceId: string;
  timestamp: number;
  packetsReceived: number;
  bytesProcessed: number;
  errors: number;
  latency: number;
}

export interface SignalingMetricsData {
  id: string;
  timestamp: number;
  service: string;
  metricType: string;
  value: number;
  unit: string;
  tags: Record<string, string>;
  host?: string;
  pid?: number;
  environment?: string;
}

export type MetricsData = SignalingMetricsData;

export interface QueueStats {
  queueName: string;
  messageCount: number;
  consumerCount: number;
}

export interface ServiceHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: number;
  uptime: number;
  rabbitmqConnected: boolean;
  version: string;
  bufferSize?: number;
  bufferFull?: boolean;
}

export interface ForwardResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface BatchForwardRequest {
  packets: RawPacket[];
}

export const QUEUE_NAMES = {
  RAW_PACKETS: 'raw_packets',
  PARSED_MESSAGES: 'parsed_messages',
  METRICS: 'metrics',
  DLQ: 'dlq',
} as const;

export const EXCHANGE_NAME = 'signaling_exchange';

export const ROUTING_KEYS = {
  RAW_PACKET: 'packet.raw',
  PARSED_MESSAGE: 'message.parsed',
  METRICS: 'system.metrics',
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];

export interface ParsedSignalingMessage {
  id: string;
  timestamp: number;
  receivedAt: number;
  type: 'offer' | 'answer' | 'ice_candidate' | 'bye' | 'other';
  source: string;
  destination: string;
  sessionId?: string;
  callId?: string;
  sdp?: string;
  iceCandidate?: {
    candidate: string;
    sdpMid?: string;
    sdpMLineIndex?: number;
  };
  rawContent: string;
  parsedContent: Record<string, unknown>;
  metadata: {
    protocol: string;
    version: string;
    encoding: string;
  };
  processingLatencyMs?: number;
}

export interface BatchInsertStats {
  totalMessages: number;
  totalBytes: number;
  insertCount: number;
  successCount: number;
  failureCount: number;
  lastInsertTime: number | null;
  averageInsertLatencyMs: number;
}

export interface ConsumerStats {
  queueName: string;
  messagesConsumed: number;
  messagesProcessed: number;
  messagesFailed: number;
  messagesRequeued?: number;
  lastMessageTime: number | null;
  prefetchCount: number;
  currentBacklog: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  services: {
    rabbitmq: 'connected' | 'disconnected' | 'error';
    clickhouse: 'connected' | 'disconnected' | 'error';
  };
  consumers: ConsumerStats[];
  insertStats: BatchInsertStats;
  queueLag: {
    parsed_messages: number;
    metrics: number;
  };
}

export interface ClickHouseConfig {
  host: string;
  username: string;
  password: string;
  database: string;
}

export interface RabbitMQConfig {
  url: string;
  parsedQueue: string;
  metricsQueue: string;
  dlqExchange: string;
  dlqQueue: string;
  prefetch: number;
}

export interface BatchConfig {
  maxSize: number;
  flushIntervalMs: number;
}

export interface SignalingMessage {
  id: string;
  timestamp: number;
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
}

export function parsedPacketToRawPacket(packet: ParsedPacket): RawPacket {
  return {
    id: packet.id,
    sourceId: packet.interfaceId,
    timestamp: packet.timestamp,
    protocol: 'tcp',
    srcIp: packet.sourceIp,
    srcPort: packet.sourcePort,
    dstIp: packet.destinationIp,
    dstPort: packet.destinationPort,
    payload: packet.rawData,
    payloadLength: packet.length,
    metadata: {
      parsedData: packet.parsedData,
      parsingSuccess: packet.parsingSuccess,
      protocol: packet.protocol
    }
  };
}

export function parsedPacketToSignalingMessage(
  packet: ParsedPacket,
  deviceMap?: Map<string, DeviceInfo>
): SignalingMessage {
  let deviceId = packet.interfaceId;
  let deviceName = `device_${deviceId}`;
  let signalingType = packet.protocol;

  if (deviceMap) {
    const device = deviceMap.get(deviceId) || deviceMap.get(packet.sourceIp);
    if (device) {
      deviceName = device.name;
      deviceId = device.id;
    }
  }

  const status = packet.parsingSuccess ? 'parsed' : 'parse_failed';
  const hash = `${packet.id}_${packet.timestamp}`;

  return {
    id: packet.id,
    timestamp: packet.timestamp,
    device_id: deviceId,
    device_name: deviceName,
    signaling_type: signalingType,
    protocol: packet.protocol,
    source_ip: packet.sourceIp,
    dest_ip: packet.destinationIp,
    source_port: packet.sourcePort,
    dest_port: packet.destinationPort,
    payload: JSON.stringify(packet.parsedData),
    length: packet.length,
    status: status,
    raw_data: packet.rawData,
    hash: hash
  };
}

export type AlertLevel = 'info' | 'warning' | 'error' | 'critical';
export type AlertType = 'anomaly' | 'threshold' | 'pattern' | 'rate' | 'custom';

export interface AlertRule {
  id: string;
  name: string;
  type: AlertType;
  level: AlertLevel;
  enabled: boolean;
  conditions: AlertCondition[];
  actions: AlertAction[];
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AlertCondition {
  field: string;
  operator: 'gt' | 'lt' | 'eq' | 'neq' | 'contains' | 'regex' | 'rate_exceeds';
  value: number | string;
  windowMs?: number;
}

export interface AlertAction {
  type: 'websocket' | 'webhook' | 'email' | 'slack';
  config: Record<string, any>;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  level: AlertLevel;
  type: AlertType;
  message: string;
  details: Record<string, any>;
  timestamp: number;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
}

export interface AlertStats {
  totalAlerts: number;
  byLevel: Record<AlertLevel, number>;
  byType: Record<AlertType, number>;
  activeAlerts: number;
  acknowledgedAlerts: number;
  lastAlertAt: number | null;
}

export interface FilterRule {
  id: string;
  type: 'whitelist' | 'blacklist';
  field: 'source_ip' | 'dest_ip' | 'source_port' | 'dest_port' |
         'signaling_type' | 'protocol' | 'device_id' | 'payload';
  operator: 'eq' | 'neq' | 'contains' | 'not_contains' | 'regex' |
            'in' | 'not_in' | 'gt' | 'lt' | 'gte' | 'lte';
  value: string | number | string[];
  enabled: boolean;
  priority: number;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface FilterResult {
  passed: boolean;
  matchedRule?: FilterRule;
  reason?: string;
  blockedCount?: number;
}

export interface FilterStats {
  totalProcessed: number;
  totalBlocked: number;
  totalPassed: number;
  byRule: Map<string, { matched: number; lastMatchedAt: number }>;
  byField: Map<string, { blocked: number; passed: number }>;
}
