import { ProtocolType } from '../../../shared/types';

export const PROTOCOL_PORTS: Record<ProtocolType, number[]> = {
  [ProtocolType.S7_COMM]: [102],
  [ProtocolType.MODBUS_TCP]: [502],
  [ProtocolType.MQTT]: [1883, 8883],
  [ProtocolType.OPC_UA]: [4840, 4843],
  [ProtocolType.DNP3]: [20000],
  [ProtocolType.IEC_104]: [2404],
  [ProtocolType.UNKNOWN]: []
};

export const PROTOCOL_NAMES: Record<ProtocolType, string> = {
  [ProtocolType.S7_COMM]: 'Siemens S7 Communication',
  [ProtocolType.MODBUS_TCP]: 'Modbus TCP',
  [ProtocolType.MQTT]: 'MQTT',
  [ProtocolType.OPC_UA]: 'OPC Unified Architecture',
  [ProtocolType.DNP3]: 'DNP3 (Distributed Network Protocol)',
  [ProtocolType.IEC_104]: 'IEC 60870-5-104',
  [ProtocolType.UNKNOWN]: 'Unknown Protocol'
};

export interface S7CommHeader {
  protocolId: number;
  headerLength: number;
  pduType: number;
  tpduNumber: number;
  dataLength: number;
}

export interface ModbusTCPHeader {
  transactionId: number;
  protocolId: number;
  length: number;
  unitId: number;
  functionCode: number;
}

export interface MQTTHeader {
  type: number;
  flags: number;
  remainingLength: number;
}

export interface OPCUAHeader {
  messageType: string;
  chunkType: string;
  messageSize: number;
}

export interface DNP3Header {
  startBytes: number[];
  length: number;
  control: number;
  destination: number;
  source: number;
}

export interface IEC104Header {
  startByte: number;
  length: number;
  controlField1: number;
  controlField2: number;
  controlField3: number;
  controlField4: number;
}

export const S7_PDU_TYPES: Record<number, string> = {
  0x01: 'Job Request',
  0x02: 'Ack',
  0x03: 'Ack Data',
  0x07: 'User Data',
  0x08: 'User Data Response'
};

export const MODBUS_FUNCTION_CODES: Record<number, string> = {
  0x01: 'Read Coils',
  0x02: 'Read Discrete Inputs',
  0x03: 'Read Holding Registers',
  0x04: 'Read Input Registers',
  0x05: 'Write Single Coil',
  0x06: 'Write Single Register',
  0x0F: 'Write Multiple Coils',
  0x10: 'Write Multiple Registers'
};

export const MQTT_PACKET_TYPES: Record<number, string> = {
  0x01: 'CONNECT',
  0x02: 'CONNACK',
  0x03: 'PUBLISH',
  0x04: 'PUBACK',
  0x05: 'PUBREC',
  0x06: 'PUBREL',
  0x07: 'PUBCOMP',
  0x08: 'SUBSCRIBE',
  0x09: 'SUBACK',
  0x0A: 'UNSUBSCRIBE',
  0x0B: 'UNSUBACK',
  0x0C: 'PINGREQ',
  0x0D: 'PINGRESP',
  0x0E: 'DISCONNECT'
};

export const DNP3_FUNCTION_CODES: Record<number, string> = {
  0x00: 'Confirm',
  0x01: 'Read',
  0x02: 'Write',
  0x03: 'Select',
  0x04: 'Operate',
  0x05: 'Direct Operate',
  0x06: 'Direct Operate No Ack',
  0x09: 'Immediate Freeze',
  0x0A: 'Immediate Freeze No Ack',
  0x0B: 'Freeze Clear',
  0x0C: 'Freeze Clear No Ack'
};

export const IEC104_ASDU_TYPES: Record<number, string> = {
  1: 'Single-point information',
  3: 'Double-point information',
  5: 'Step position information',
  7: 'Bitstring of 32 bit',
  9: 'Measured value, normalized value',
  11: 'Measured value, scaled value',
  13: 'Measured value, short floating point',
  45: 'Single command',
  46: 'Double command',
  47: 'Regulating step command',
  48: 'Set point command, normalized value',
  49: 'Set point command, scaled value',
  50: 'Set point command, short floating point'
};

export const SIMULATED_DEVICES = [
  { id: 'plc-001', name: 'Siemens S7-400 PLC', type: 'PLC', ip: '192.168.1.10', protocols: [ProtocolType.S7_COMM] },
  { id: 'plc-002', name: 'Siemens S7-1200 PLC', type: 'PLC', ip: '192.168.1.11', protocols: [ProtocolType.S7_COMM, ProtocolType.MODBUS_TCP] },
  { id: 'rtu-001', name: 'Modbus RTU Gateway', type: 'RTU', ip: '192.168.1.20', protocols: [ProtocolType.MODBUS_TCP] },
  { id: 'rtu-002', name: 'DNP3 RTU', type: 'RTU', ip: '192.168.1.21', protocols: [ProtocolType.DNP3] },
  { id: 'scada-001', name: 'SCADA Server', type: 'SCADA', ip: '192.168.1.30', protocols: [ProtocolType.MQTT, ProtocolType.OPC_UA] },
  { id: 'hmi-001', name: 'Operator HMI', type: 'HMI', ip: '192.168.1.31', protocols: [ProtocolType.S7_COMM, ProtocolType.MQTT] },
  { id: 'sensor-001', name: 'Temperature Sensor Array', type: 'Sensor', ip: '192.168.1.40', protocols: [ProtocolType.MQTT] },
  { id: 'sensor-002', name: 'Pressure Sensors', type: 'Sensor', ip: '192.168.1.41', protocols: [ProtocolType.MODBUS_TCP, ProtocolType.IEC_104] },
  { id: 'gateway-001', name: 'Protocol Gateway', type: 'Gateway', ip: '192.168.1.50', protocols: [ProtocolType.OPC_UA, ProtocolType.IEC_104, ProtocolType.MODBUS_TCP] },
  { id: 'historian-001', name: 'Data Historian', type: 'Historian', ip: '192.168.1.60', protocols: [ProtocolType.OPC_UA, ProtocolType.MQTT] }
];

export const NETWORK_INTERFACES = [
  { id: 'eth0', name: 'Ethernet Port 0', description: 'Main control network' },
  { id: 'eth1', name: 'Ethernet Port 1', description: 'Field device network' },
  { id: 'eth2', name: 'Ethernet Port 2', description: 'SCADA network' }
];
