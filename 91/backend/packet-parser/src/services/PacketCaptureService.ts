import { NetworkPacket, ProtocolType, PacketDirection, CaptureStatus, DeviceInfo } from '../../../shared/types';
import { logger } from '../../../shared/logger';
import { SIMULATED_DEVICES, NETWORK_INTERFACES, PROTOCOL_PORTS } from '../models/IndustrialProtocols';
import { randomUUID } from 'crypto';

export class PacketCaptureService {
  private captureSessions: Map<string, { interval: NodeJS.Timeout; count: number; startTime: number }> = new Map();
  private packetCallbacks: Map<string, (packet: NetworkPacket) => void> = new Map();

  private getRandomElement<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  private getRandomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private generateRandomBuffer(length: number): Buffer {
    const buffer = Buffer.alloc(length);
    for (let i = 0; i < length; i++) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
    return buffer;
  }

  private generateS7Payload(): Buffer {
    const length = this.getRandomInt(30, 120);
    const buffer = Buffer.alloc(length);
    buffer[0] = 0x03;
    buffer[1] = 0x00;
    buffer.writeUInt16BE(length, 2);
    buffer[4] = 0x02;
    buffer[5] = 0xF0;
    buffer[6] = 0x80;
    buffer[7] = this.getRandomInt(1, 10);
    buffer[8] = 0x00;
    buffer[9] = 0x00;
    buffer[10] = this.getRandomInt(1, 255);
    const pduType = this.getRandomElement([0x01, 0x02, 0x03, 0x07, 0x08]);
    buffer[11] = pduType;
    buffer[12] = 0x00;
    buffer[13] = 0x00;
    buffer.writeUInt16BE(this.getRandomInt(1, 1000), 14);
    for (let i = 16; i < length; i++) {
      buffer[i] = this.getRandomInt(0, 255);
    }
    return buffer;
  }

  private generateModbusTCPPayload(): Buffer {
    const length = this.getRandomInt(12, 60);
    const buffer = Buffer.alloc(length);
    buffer.writeUInt16BE(this.getRandomInt(1, 65535), 0);
    buffer.writeUInt16BE(0x0000, 2);
    buffer.writeUInt16BE(length - 6, 4);
    buffer[6] = this.getRandomInt(1, 247);
    const functionCodes = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x0F, 0x10];
    buffer[7] = this.getRandomElement(functionCodes);
    buffer.writeUInt16BE(this.getRandomInt(0, 65535), 8);
    buffer.writeUInt16BE(this.getRandomInt(1, 125), 10);
    for (let i = 12; i < length; i++) {
      buffer[i] = this.getRandomInt(0, 255);
    }
    return buffer;
  }

  private generateMQTTPayload(): Buffer {
    const length = this.getRandomInt(20, 150);
    const buffer = Buffer.alloc(length);
    const packetTypes = [0x10, 0x20, 0x30, 0x82, 0x90, 0xC0, 0xD0, 0xE0];
    buffer[0] = this.getRandomElement(packetTypes);
    let remainingLength = length - 2;
    let offset = 1;
    do {
      let byte = remainingLength & 0x7F;
      remainingLength >>= 7;
      if (remainingLength > 0) {
        byte |= 0x80;
      }
      buffer[offset++] = byte;
    } while (remainingLength > 0 && offset < 5);
    if (buffer[0] >> 4 === 0x01) {
      buffer.writeUInt16BE(4, offset);
      offset += 2;
      buffer.write('MQTT', offset);
      offset += 4;
      buffer[offset++] = 0x04;
      buffer[offset++] = 0x02;
      buffer.writeUInt16BE(60, offset);
      offset += 2;
      const clientId = 'client-' + randomUUID().substring(0, 8);
      buffer.writeUInt16BE(clientId.length, offset);
      offset += 2;
      buffer.write(clientId, offset);
    } else if (buffer[0] >> 4 === 0x03) {
      const topic = this.getRandomElement(['sensors/temp', 'sensors/pressure', 'devices/status', 'alarms/critical']);
      buffer.writeUInt16BE(topic.length, offset);
      offset += 2;
      buffer.write(topic, offset);
      offset += topic.length;
      const payload = JSON.stringify({
        value: this.getRandomInt(0, 100),
        timestamp: Date.now()
      });
      buffer.write(payload, offset);
    }
    for (let i = offset; i < length; i++) {
      buffer[i] = this.getRandomInt(0, 255);
    }
    return buffer;
  }

  private generateOPCUAPayload(): Buffer {
    const length = this.getRandomInt(24, 200);
    const buffer = Buffer.alloc(length);
    const messageTypes = ['HEL', 'ACK', 'OPN', 'MSG', 'CLO'];
    buffer.write(this.getRandomElement(messageTypes), 0);
    const chunkTypes = ['F', 'C', 'A'];
    buffer.write(this.getRandomElement(chunkTypes), 3);
    buffer.writeUInt32LE(length, 4);
    if (length > 8) {
      buffer.writeUInt32LE(this.getRandomInt(0, 65535), 8);
      buffer.writeUInt32LE(this.getRandomInt(0, 65535), 12);
      buffer.writeUInt32LE(0, 16);
      buffer.writeUInt32LE(this.getRandomInt(1000, 65535), 20);
    }
    for (let i = 24; i < length; i++) {
      buffer[i] = this.getRandomInt(0, 255);
    }
    return buffer;
  }

  private generateDNP3Payload(): Buffer {
    const length = this.getRandomInt(10, 100);
    const buffer = Buffer.alloc(length);
    buffer[0] = 0x05;
    buffer[1] = 0x64;
    buffer.writeUInt8(length - 5, 2);
    buffer[3] = this.getRandomInt(0, 255);
    buffer.writeUInt16BE(this.getRandomInt(1, 65534), 4);
    buffer.writeUInt16BE(this.getRandomInt(1, 65534), 6);
    const functionCodes = [0x00, 0x01, 0x02, 0x05, 0x06, 0x09, 0x0A];
    buffer[8] = this.getRandomElement(functionCodes);
    buffer[9] = this.getRandomInt(1, 255);
    for (let i = 10; i < length - 2; i++) {
      buffer[i] = this.getRandomInt(0, 255);
    }
    let crc = 0xFFFF;
    for (let i = 0; i < length - 2; i++) {
      crc ^= buffer[i];
      for (let j = 0; j < 8; j++) {
        if (crc & 1) {
          crc = (crc >> 1) ^ 0xA001;
        } else {
          crc >>= 1;
        }
      }
    }
    buffer.writeUInt16LE(crc, length - 2);
    return buffer;
  }

  private generateIEC104Payload(): Buffer {
    const length = this.getRandomInt(8, 80);
    const buffer = Buffer.alloc(length);
    buffer[0] = 0x68;
    buffer[1] = length - 2;
    buffer[2] = this.getRandomInt(0, 255);
    buffer[3] = this.getRandomInt(0, 255);
    buffer[4] = this.getRandomInt(0, 255);
    buffer[5] = this.getRandomInt(0, 255);
    if (length > 6) {
      const asduTypes = [1, 3, 5, 9, 11, 13, 45, 46, 48, 50];
      buffer[6] = this.getRandomElement(asduTypes);
      buffer[7] = this.getRandomInt(1, 20);
      buffer[8] = 0x00;
      buffer.writeUInt16BE(this.getRandomInt(1, 65534), 9);
    }
    for (let i = 11; i < length; i++) {
      buffer[i] = this.getRandomInt(0, 255);
    }
    return buffer;
  }

  public generateRandomPacket(interfaceId?: string): NetworkPacket {
    const device = this.getRandomElement(SIMULATED_DEVICES);
    const protocol = this.getRandomElement(device.protocols);
    const ports = PROTOCOL_PORTS[protocol];
    const direction = this.getRandomElement([PacketDirection.REQUEST, PacketDirection.RESPONSE]);
    const serverDevice = this.getRandomElement(SIMULATED_DEVICES.filter(d => d.id !== device.id));
    let sourceIp: string, sourcePort: number, destinationIp: string, destinationPort: number;
    if (direction === PacketDirection.REQUEST) {
      sourceIp = device.ip;
      sourcePort = this.getRandomInt(49152, 65535);
      destinationIp = serverDevice.ip;
      destinationPort = this.getRandomElement(ports);
    } else {
      sourceIp = serverDevice.ip;
      sourcePort = this.getRandomElement(ports);
      destinationIp = device.ip;
      destinationPort = this.getRandomInt(49152, 65535);
    }
    let rawBuffer: Buffer;
    switch (protocol) {
      case ProtocolType.S7_COMM:
        rawBuffer = this.generateS7Payload();
        break;
      case ProtocolType.MODBUS_TCP:
        rawBuffer = this.generateModbusTCPPayload();
        break;
      case ProtocolType.MQTT:
        rawBuffer = this.generateMQTTPayload();
        break;
      case ProtocolType.OPC_UA:
        rawBuffer = this.generateOPCUAPayload();
        break;
      case ProtocolType.DNP3:
        rawBuffer = this.generateDNP3Payload();
        break;
      case ProtocolType.IEC_104:
        rawBuffer = this.generateIEC104Payload();
        break;
      default:
        rawBuffer = this.generateRandomBuffer(this.getRandomInt(20, 100));
    }
    const iface = interfaceId || this.getRandomElement(NETWORK_INTERFACES).id;
    return {
      id: randomUUID(),
      timestamp: Date.now(),
      protocol,
      sourceIp,
      sourcePort,
      destinationIp,
      destinationPort,
      length: rawBuffer.length,
      rawData: rawBuffer.toString('hex'),
      direction,
      interfaceId: iface
    };
  }

  public generateBatchPackets(count: number, interfaceId?: string): NetworkPacket[] {
    const packets: NetworkPacket[] = [];
    for (let i = 0; i < count; i++) {
      packets.push(this.generateRandomPacket(interfaceId));
    }
    logger.info(`Generated ${count} packets`);
    return packets;
  }

  public startCapture(interfaceId: string, callback: (packet: NetworkPacket) => void): CaptureStatus {
    if (this.captureSessions.has(interfaceId)) {
      logger.warn(`Capture already running on interface ${interfaceId}`);
      return this.getCaptureStatus(interfaceId)!;
    }
    this.packetCallbacks.set(interfaceId, callback);
    const startTime = Date.now();
    let count = 0;
    const minInterval = parseInt(process.env.CAPTURE_INTERVAL_MIN || '100');
    const maxInterval = parseInt(process.env.CAPTURE_INTERVAL_MAX || '500');
    const captureLoop = () => {
      if (!this.captureSessions.has(interfaceId)) return;
      const packet = this.generateRandomPacket(interfaceId);
      count++;
      const cb = this.packetCallbacks.get(interfaceId);
      if (cb) {
        try {
          cb(packet);
        } catch (error) {
          logger.error(`Error in capture callback for ${interfaceId}:`, error);
        }
      }
      const session = this.captureSessions.get(interfaceId);
      if (session) {
        session.count = count;
      }
      const interval = this.getRandomInt(minInterval, maxInterval);
      const newInterval = setTimeout(captureLoop, interval);
      if (this.captureSessions.has(interfaceId)) {
        this.captureSessions.set(interfaceId, {
          interval: newInterval,
          count,
          startTime
        });
      }
    };
    const interval = setTimeout(captureLoop, this.getRandomInt(minInterval, maxInterval));
    this.captureSessions.set(interfaceId, {
      interval,
      count: 0,
      startTime
    });
    logger.info(`Started capture on interface ${interfaceId}`);
    return {
      interfaceId,
      isRunning: true,
      packetsCaptured: 0,
      startTime
    };
  }

  public stopCapture(interfaceId: string): CaptureStatus | null {
    const session = this.captureSessions.get(interfaceId);
    if (!session) {
      logger.warn(`No capture running on interface ${interfaceId}`);
      return null;
    }
    clearTimeout(session.interval);
    this.captureSessions.delete(interfaceId);
    this.packetCallbacks.delete(interfaceId);
    logger.info(`Stopped capture on interface ${interfaceId}. Total packets: ${session.count}`);
    return {
      interfaceId,
      isRunning: false,
      packetsCaptured: session.count,
      startTime: session.startTime,
      endTime: Date.now()
    };
  }

  public getCaptureStatus(interfaceId: string): CaptureStatus | null {
    const session = this.captureSessions.get(interfaceId);
    if (!session) {
      return null;
    }
    return {
      interfaceId,
      isRunning: true,
      packetsCaptured: session.count,
      startTime: session.startTime
    };
  }

  public getAllCaptureStatuses(): CaptureStatus[] {
    const statuses: CaptureStatus[] = [];
    for (const interfaceId of this.captureSessions.keys()) {
      const status = this.getCaptureStatus(interfaceId);
      if (status) {
        statuses.push(status);
      }
    }
    return statuses;
  }

  public getDevices(): DeviceInfo[] {
    return SIMULATED_DEVICES;
  }

  public getInterfaces() {
    return NETWORK_INTERFACES;
  }

  public stopAllCaptures(): void {
    for (const interfaceId of this.captureSessions.keys()) {
      this.stopCapture(interfaceId);
    }
  }
}

export default new PacketCaptureService();
