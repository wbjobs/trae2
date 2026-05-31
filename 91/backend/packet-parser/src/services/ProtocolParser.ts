import { ParsedPacket, NetworkPacket, ProtocolType } from '../../../shared/types';
import { logger } from '../../../shared/logger';
import {
  S7_PDU_TYPES,
  MODBUS_FUNCTION_CODES,
  MQTT_PACKET_TYPES,
  DNP3_FUNCTION_CODES,
  IEC104_ASDU_TYPES,
  PROTOCOL_PORTS,
  S7CommHeader,
  ModbusTCPHeader,
  MQTTHeader,
  OPCUAHeader,
  DNP3Header,
  IEC104Header
} from '../models/IndustrialProtocols';

export class ProtocolParser {
  private hexToBuffer(hexString: string): Buffer {
    return Buffer.from(hexString, 'hex');
  }

  private parseS7CommHeader(buffer: Buffer): S7CommHeader | null {
    if (buffer.length < 16) return null;
    return {
      protocolId: buffer[7],
      headerLength: buffer[8],
      pduType: buffer[11],
      tpduNumber: buffer[14],
      dataLength: buffer.readUInt16BE(15)
    };
  }

  public parseS7Comm(buffer: Buffer): Record<string, any> {
    const result: Record<string, any> = {};
    try {
      if (buffer.length >= 7 && buffer[0] === 0x03 && buffer[1] === 0x00) {
        result.tpkt = {
          version: buffer[0],
          reserved: buffer[1],
          length: buffer.readUInt16BE(2)
        };
      }
      if (buffer.length >= 11 && buffer[4] === 0x02) {
        result.cotp = {
          length: buffer[4],
          pduType: buffer[5] === 0xF0 ? 'Data' : 'Other',
          tpduNumber: buffer[6] >> 1,
          lastDataUnit: (buffer[6] & 0x01) === 1
        };
      }
      const header = this.parseS7CommHeader(buffer);
      if (header) {
        result.s7Header = {
          ...header,
          pduTypeName: S7_PDU_TYPES[header.pduType] || 'Unknown',
          rosctr: header.pduType,
          parametersLength: buffer.readUInt16BE(17),
          dataLength: buffer.readUInt16BE(19)
        };
        if (buffer.length > 21) {
          result.parameters = buffer.slice(21, 21 + result.s7Header.parametersLength).toString('hex');
          if (result.s7Header.parametersLength > 0 && buffer.length > 21 + result.s7Header.parametersLength) {
            const dataStart = 21 + result.s7Header.parametersLength;
            const dataEnd = dataStart + result.s7Header.dataLength;
            result.data = buffer.slice(dataStart, Math.min(dataEnd, buffer.length)).toString('hex');
          }
        }
      }
      result.rawHex = buffer.toString('hex');
    } catch (error) {
      logger.error('Error parsing S7Comm:', error);
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }
    return result;
  }

  private parseModbusTCPHeader(buffer: Buffer): ModbusTCPHeader | null {
    if (buffer.length < 8) return null;
    return {
      transactionId: buffer.readUInt16BE(0),
      protocolId: buffer.readUInt16BE(2),
      length: buffer.readUInt16BE(4),
      unitId: buffer[6],
      functionCode: buffer[7]
    };
  }

  public parseModbusTCP(buffer: Buffer): Record<string, any> {
    const result: Record<string, any> = {};
    try {
      const header = this.parseModbusTCPHeader(buffer);
      if (header) {
        result.header = {
          ...header,
          functionName: MODBUS_FUNCTION_CODES[header.functionCode] || `Unknown (${header.functionCode})`,
          isException: header.functionCode > 0x80
        };
        if (buffer.length > 8) {
          const data = buffer.slice(8);
          result.data = data.toString('hex');
          if (header.functionCode === 0x03 || header.functionCode === 0x04) {
            if (data.length >= 1) {
              const byteCount = data[0];
              result.byteCount = byteCount;
              const registers: number[] = [];
              for (let i = 1; i < data.length && i < byteCount; i += 2) {
                registers.push(data.readUInt16BE(i));
              }
              result.registers = registers;
            }
          } else if (header.functionCode === 0x06) {
            if (data.length >= 4) {
              result.referenceAddress = data.readUInt16BE(0);
              result.value = data.readUInt16BE(2);
            }
          } else if (header.functionCode === 0x10) {
            if (data.length >= 5) {
              result.referenceAddress = data.readUInt16BE(0);
              result.registerCount = data.readUInt16BE(2);
              result.byteCount = data[4];
              const values: number[] = [];
              for (let i = 5; i < data.length; i += 2) {
                values.push(data.readUInt16BE(i));
              }
              result.values = values;
            }
          }
        }
      }
      result.rawHex = buffer.toString('hex');
    } catch (error) {
      logger.error('Error parsing Modbus TCP:', error);
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }
    return result;
  }

  private parseMQTTHeader(buffer: Buffer): MQTTHeader | null {
    if (buffer.length < 2) return null;
    return {
      type: (buffer[0] & 0xF0) >> 4,
      flags: buffer[0] & 0x0F,
      remainingLength: buffer[1]
    };
  }

  public parseMQTT(buffer: Buffer): Record<string, any> {
    const result: Record<string, any> = {};
    try {
      const header = this.parseMQTTHeader(buffer);
      if (header) {
        result.header = {
          ...header,
          packetTypeName: MQTT_PACKET_TYPES[header.type] || `Unknown (${header.type})`,
          dupFlag: (header.flags & 0x08) !== 0,
          qosLevel: (header.flags & 0x06) >> 1,
          retainFlag: (header.flags & 0x01) !== 0
        };
        let offset = 2;
        let multiplier = 1;
        let remainingLength = 0;
        let byte: number;
        do {
          if (offset >= buffer.length) break;
          byte = buffer[offset++];
          remainingLength += (byte & 0x7F) * multiplier;
          multiplier *= 128;
        } while ((byte & 0x80) !== 0);
        result.remainingLength = remainingLength;
        if (header.type === 0x01 && offset < buffer.length) {
          const protocolNameLen = buffer.readUInt16BE(offset);
          offset += 2;
          result.protocolName = buffer.slice(offset, offset + protocolNameLen).toString();
          offset += protocolNameLen;
          result.protocolLevel = buffer[offset++];
          result.connectFlags = {
            value: buffer[offset],
            usernameFlag: (buffer[offset] & 0x80) !== 0,
            passwordFlag: (buffer[offset] & 0x40) !== 0,
            willRetain: (buffer[offset] & 0x20) !== 0,
            willQos: (buffer[offset] & 0x18) >> 3,
            willFlag: (buffer[offset] & 0x04) !== 0,
            cleanSession: (buffer[offset] & 0x02) !== 0
          };
          offset++;
          result.keepAlive = buffer.readUInt16BE(offset);
          offset += 2;
          const clientIdLen = buffer.readUInt16BE(offset);
          offset += 2;
          result.clientId = buffer.slice(offset, offset + clientIdLen).toString();
        } else if (header.type === 0x03 && offset < buffer.length) {
          const topicLen = buffer.readUInt16BE(offset);
          offset += 2;
          result.topic = buffer.slice(offset, offset + topicLen).toString();
          offset += topicLen;
          if (result.header.qosLevel > 0 && offset < buffer.length) {
            result.packetId = buffer.readUInt16BE(offset);
            offset += 2;
          }
          if (offset < buffer.length) {
            const payloadBuffer = buffer.slice(offset);
            try {
              result.payload = JSON.parse(payloadBuffer.toString());
            } catch {
              result.payload = payloadBuffer.toString();
            }
          }
        }
      }
      result.rawHex = buffer.toString('hex');
    } catch (error) {
      logger.error('Error parsing MQTT:', error);
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }
    return result;
  }

  private parseOPCUAHeader(buffer: Buffer): OPCUAHeader | null {
    if (buffer.length < 8) return null;
    return {
      messageType: buffer.slice(0, 3).toString(),
      chunkType: buffer.slice(3, 4).toString(),
      messageSize: buffer.readUInt32LE(4)
    };
  }

  public parseOPCUA(buffer: Buffer): Record<string, any> {
    const result: Record<string, any> = {};
    try {
      const header = this.parseOPCUAHeader(buffer);
      if (header) {
        result.header = {
          ...header,
          isFinal: header.chunkType === 'F',
          isAbort: header.chunkType === 'A'
        };
        if (buffer.length > 8) {
          result.secureChannelId = buffer.readUInt32LE(8);
          if (buffer.length > 12) {
            result.securityTokenId = buffer.readUInt32LE(12);
          }
          if (buffer.length > 20) {
            result.sequenceNumber = buffer.readUInt32LE(16);
            result.requestId = buffer.readUInt32LE(20);
          }
          if (buffer.length > 24) {
            result.nodeId = buffer.slice(24, Math.min(32, buffer.length)).toString('hex');
          }
        }
      }
      result.rawHex = buffer.toString('hex');
    } catch (error) {
      logger.error('Error parsing OPC UA:', error);
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }
    return result;
  }

  private parseDNP3Header(buffer: Buffer): DNP3Header | null {
    if (buffer.length < 8) return null;
    return {
      startBytes: [buffer[0], buffer[1]],
      length: buffer[2],
      control: buffer[3],
      destination: buffer.readUInt16BE(4),
      source: buffer.readUInt16BE(6)
    };
  }

  public parseDNP3(buffer: Buffer): Record<string, any> {
    const result: Record<string, any> = {};
    try {
      const header = this.parseDNP3Header(buffer);
      if (header) {
        result.header = {
          ...header,
          validStart: header.startBytes[0] === 0x05 && header.startBytes[1] === 0x64,
          controlFlags: {
            fir: (header.control & 0x80) !== 0,
            fin: (header.control & 0x40) !== 0,
            con: (header.control & 0x20) !== 0,
            uns: (header.control & 0x10) !== 0,
            seq: header.control & 0x0F
          }
        };
        if (buffer.length > 8) {
          const functionCode = buffer[8];
          result.applicationLayer = {
            functionCode,
            functionName: DNP3_FUNCTION_CODES[functionCode] || `Unknown (${functionCode})`,
            sequenceNumber: buffer[9] & 0x0F
          };
          if (buffer.length > 10) {
            const objectCount = buffer.length - 12;
            result.objects = [];
            let offset = 10;
            while (offset < buffer.length - 2) {
              const objGroup = buffer[offset];
              const objVariation = buffer[offset + 1];
              const qualifier = buffer[offset + 2];
              offset += 3;
              const range = buffer[offset];
              offset += 1;
              result.objects.push({
                group: objGroup,
                variation: objVariation,
                qualifier,
                range
              });
              offset += Math.min(range * 2, buffer.length - offset - 2);
            }
          }
        }
        if (buffer.length >= 2) {
          const crcOffset = buffer.length - 2;
          result.crc = buffer.readUInt16LE(crcOffset);
          result.crcValid = this.verifyDNP3CRC(buffer);
        }
      }
      result.rawHex = buffer.toString('hex');
    } catch (error) {
      logger.error('Error parsing DNP3:', error);
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }
    return result;
  }

  private verifyDNP3CRC(buffer: Buffer): boolean {
    try {
      const dataLength = buffer.length - 2;
      let crc = 0xFFFF;
      for (let i = 0; i < dataLength; i++) {
        crc ^= buffer[i];
        for (let j = 0; j < 8; j++) {
          if (crc & 1) {
            crc = (crc >> 1) ^ 0xA001;
          } else {
            crc >>= 1;
          }
        }
      }
      const expectedCRC = buffer.readUInt16LE(dataLength);
      return crc === expectedCRC;
    } catch {
      return false;
    }
  }

  private parseIEC104Header(buffer: Buffer): IEC104Header | null {
    if (buffer.length < 6) return null;
    return {
      startByte: buffer[0],
      length: buffer[1],
      controlField1: buffer[2],
      controlField2: buffer[3],
      controlField3: buffer[4],
      controlField4: buffer[5]
    };
  }

  public parseIEC104(buffer: Buffer): Record<string, any> {
    const result: Record<string, any> = {};
    try {
      const header = this.parseIEC104Header(buffer);
      if (header) {
        result.header = {
          ...header,
          validStart: header.startByte === 0x68,
          apduLength: header.length + 2
        };
        const type = header.controlField1 & 0x03;
        if (type === 0) {
          result.frameType = 'I-format (Information)';
          result.sendSequenceNumber = ((header.controlField2 << 8) | header.controlField1) >> 1;
          result.receiveSequenceNumber = ((header.controlField4 << 8) | header.controlField3) >> 1;
        } else if (type === 1) {
          result.frameType = 'S-format (Supervisory)';
          result.receiveSequenceNumber = ((header.controlField4 << 8) | header.controlField3) >> 1;
        } else {
          result.frameType = 'U-format (Unnumbered)';
          result.controlFlags = {
            testfrActiv: (header.controlField1 & 0x80) !== 0,
            testfrCon: (header.controlField1 & 0x40) !== 0,
            stopdtActiv: (header.controlField1 & 0x20) !== 0,
            stopdtCon: (header.controlField1 & 0x10) !== 0,
            startdtActiv: (header.controlField1 & 0x08) !== 0,
            startdtCon: (header.controlField1 & 0x04) !== 0
          };
        }
        if (buffer.length > 6) {
          const asdu = buffer.slice(6);
          if (asdu.length >= 4) {
            const asduType = asdu[0];
            result.asdu = {
              typeId: asduType,
              typeName: IEC104_ASDU_TYPES[asduType] || `Unknown (${asduType})`,
              variableStructure: asdu[1],
              numberOfElements: asdu[1] & 0x7F,
              isSequence: (asdu[1] & 0x80) !== 0,
              causeOfTransmission: asdu[2] & 0x3F,
              isNegative: (asdu[2] & 0x40) !== 0,
              isTest: (asdu[2] & 0x80) !== 0,
              originatorAddress: asdu.length > 3 ? asdu[3] : 0,
              commonAddress: asdu.length > 5 ? asdu.readUInt16BE(4) : 0
            };
            if (asdu.length > 6) {
              result.asdu.payload = asdu.slice(6).toString('hex');
              const infoObjects: Record<string, any>[] = [];
              let offset = 6;
              for (let i = 0; i < result.asdu.numberOfElements && offset < asdu.length; i++) {
                if (asdu.length > offset + 3) {
                  const ioa = asdu.readUIntLE(offset, 3);
                  offset += 3;
                  const infoObj: Record<string, any> = {
                    infoObjectAddress: ioa
                  };
                  if (asdu.length > offset) {
                    const value = asdu[offset];
                    if (asduType === 1) {
                      infoObj.spi = (value & 0x01) !== 0;
                      infoObj.quality = {
                        iv: (value & 0x80) !== 0,
                        nt: (value & 0x40) !== 0,
                        sb: (value & 0x20) !== 0,
                        bl: (value & 0x10) !== 0,
                        sp: (value & 0x08) !== 0,
                        ck: (value & 0x04) !== 0
                      };
                    } else if (asduType === 9 || asduType === 11) {
                      infoObj.normalizedValue = asdu.readInt16BE(offset);
                    } else if (asduType === 13) {
                      infoObj.floatValue = asdu.readFloatBE(offset);
                    }
                    infoObjects.push(infoObj);
                    offset += 2;
                  }
                  infoObjects.push(infoObj);
                }
              }
              result.asdu.infoObjects = infoObjects;
            }
          }
        }
      }
      result.rawHex = buffer.toString('hex');
    } catch (error) {
      logger.error('Error parsing IEC 104:', error);
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }
    return result;
  }

  public detectProtocol(buffer: Buffer, sourcePort?: number, destinationPort?: number): ProtocolType {
    if (sourcePort) {
      for (const [protocol, ports] of Object.entries(PROTOCOL_PORTS)) {
        if (ports.includes(sourcePort)) {
          return protocol as ProtocolType;
        }
      }
    }
    if (destinationPort) {
      for (const [protocol, ports] of Object.entries(PROTOCOL_PORTS)) {
        if (ports.includes(destinationPort)) {
          return protocol as ProtocolType;
        }
      }
    }
    if (buffer.length >= 2 && buffer[0] === 0x03 && buffer[1] === 0x00) {
      return ProtocolType.S7_COMM;
    }
    if (buffer.length >= 3 && buffer[0] === 0x05 && buffer[1] === 0x64) {
      return ProtocolType.DNP3;
    }
    if (buffer.length >= 1 && buffer[0] === 0x68) {
      return ProtocolType.IEC_104;
    }
    if (buffer.length >= 6 && buffer.readUInt16BE(2) === buffer.length - 6) {
      const functionCode = buffer[7];
      if ((functionCode >= 1 && functionCode <= 6) || (functionCode >= 15 && functionCode <= 16)) {
        return ProtocolType.MODBUS_TCP;
      }
    }
    if (buffer.length >= 3) {
      const mqttType = (buffer[0] & 0xF0) >> 4;
      if (mqttType >= 1 && mqttType <= 14) {
        const flags = buffer[0] & 0x0F;
        const qos = (flags & 0x06) >> 1;
        if (qos >= 0 && qos <= 2) {
          return ProtocolType.MQTT;
        }
      }
    }
    if (buffer.length >= 4) {
      const msgType = buffer.slice(0, 3).toString();
      if (['HEL', 'ACK', 'OPN', 'MSG', 'CLO'].includes(msgType)) {
        return ProtocolType.OPC_UA;
      }
    }
    return ProtocolType.UNKNOWN;
  }

  public autoDetectAndParse(buffer: Buffer, sourcePort?: number, destinationPort?: number): { protocol: ProtocolType; data: Record<string, any> } {
    const protocol = this.detectProtocol(buffer, sourcePort, destinationPort);
    let data: Record<string, any>;
    switch (protocol) {
      case ProtocolType.S7_COMM:
        data = this.parseS7Comm(buffer);
        break;
      case ProtocolType.MODBUS_TCP:
        data = this.parseModbusTCP(buffer);
        break;
      case ProtocolType.MQTT:
        data = this.parseMQTT(buffer);
        break;
      case ProtocolType.OPC_UA:
        data = this.parseOPCUA(buffer);
        break;
      case ProtocolType.DNP3:
        data = this.parseDNP3(buffer);
        break;
      case ProtocolType.IEC_104:
        data = this.parseIEC104(buffer);
        break;
      default:
        data = { rawHex: buffer.toString('hex') };
    }
    return { protocol, data };
  }

  public parsePacket(packet: NetworkPacket): ParsedPacket {
    try {
      const buffer = this.hexToBuffer(packet.rawData);
      const { protocol, data } = this.autoDetectAndParse(
        buffer,
        packet.sourcePort,
        packet.destinationPort
      );
      return {
        ...packet,
        protocol: protocol !== ProtocolType.UNKNOWN ? protocol : packet.protocol,
        parsedData: data,
        parsingSuccess: !data.error,
        parsingError: data.error
      };
    } catch (error) {
      logger.error('Error parsing packet:', error);
      return {
        ...packet,
        parsedData: {},
        parsingSuccess: false,
        parsingError: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  public parsePackets(packets: NetworkPacket[]): ParsedPacket[] {
    return packets.map(packet => this.parsePacket(packet));
  }
}

export default new ProtocolParser();
