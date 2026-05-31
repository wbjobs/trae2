import { Context } from 'koa';
import axios from 'axios';
import { NetworkPacket, ParsedPacket, APIResponse, parsedPacketToRawPacket } from '../../../shared/types';
import { logger } from '../../../shared/logger';
import packetCaptureService from '../services/PacketCaptureService';
import protocolParser from '../services/ProtocolParser';

export class CaptureController {
  private async sendToMirrorForward(parsedPackets: ParsedPacket[]): Promise<void> {
    const mirrorUrl = process.env.MIRROR_FORWARD_URL;
    if (!mirrorUrl) {
      logger.warn('MIRROR_FORWARD_URL not configured, skipping forward');
      return;
    }
    try {
      const rawPackets = parsedPackets.map(parsedPacketToRawPacket);
      await axios.post(`${mirrorUrl}/api/forward/batch`, {
        packets: rawPackets
      }, {
        headers: { 
          'Content-Type': 'application/json',
          'X-Source-Id': 'packet-parser'
        },
        timeout: 5000
      });
      logger.debug(`Forwarded ${parsedPackets.length} packets to mirror-forward`);
    } catch (error) {
      logger.error('Failed to forward packets to mirror-forward:', error);
    }
  }

  private handlePacketCallback = async (packet: NetworkPacket) => {
    try {
      const parsedPacket = protocolParser.parsePacket(packet);
      await this.sendToMirrorForward([parsedPacket]);
    } catch (error) {
      logger.error('Error handling captured packet:', error);
    }
  };

  public async startCapture(ctx: Context): Promise<void> {
    try {
      const iface = ctx.query.iface as string;
      if (!iface) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          error: 'Interface ID is required. Use ?iface=eth0'
        } as APIResponse;
        return;
      }
      const validInterfaces = packetCaptureService.getInterfaces();
      if (!validInterfaces.find(i => i.id === iface)) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          error: `Invalid interface. Valid interfaces: ${validInterfaces.map(i => i.id).join(', ')}`
        } as APIResponse;
        return;
      }
      const status = packetCaptureService.startCapture(iface, this.handlePacketCallback);
      ctx.body = {
        success: true,
        data: status,
        message: `Capture started on interface ${iface}`
      } as APIResponse;
    } catch (error) {
      logger.error('Error starting capture:', error);
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      } as APIResponse;
    }
  }

  public async stopCapture(ctx: Context): Promise<void> {
    try {
      const iface = ctx.query.iface as string;
      if (!iface) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          error: 'Interface ID is required. Use ?iface=eth0'
        } as APIResponse;
        return;
      }
      const status = packetCaptureService.stopCapture(iface);
      if (!status) {
        ctx.status = 404;
        ctx.body = {
          success: false,
          error: `No capture running on interface ${iface}`
        } as APIResponse;
        return;
      }
      ctx.body = {
        success: true,
        data: status,
        message: `Capture stopped on interface ${iface}`
      } as APIResponse;
    } catch (error) {
      logger.error('Error stopping capture:', error);
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      } as APIResponse;
    }
  }

  public async getStatus(ctx: Context): Promise<void> {
    try {
      const iface = ctx.query.iface as string;
      let data;
      if (iface) {
        data = packetCaptureService.getCaptureStatus(iface);
        if (!data) {
          ctx.status = 404;
          ctx.body = {
            success: false,
            error: `No capture found for interface ${iface}`
          } as APIResponse;
          return;
        }
      } else {
        data = {
          captures: packetCaptureService.getAllCaptureStatuses(),
          interfaces: packetCaptureService.getInterfaces(),
          devices: packetCaptureService.getDevices()
        };
      }
      ctx.body = {
        success: true,
        data
      } as APIResponse;
    } catch (error) {
      logger.error('Error getting status:', error);
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      } as APIResponse;
    }
  }

  public async parsePackets(ctx: Context): Promise<void> {
    try {
      const body = ctx.request.body as any;
      if (!body || (!body.packets && !body.rawData && !body.packet)) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          error: 'Request body must contain packets array, rawData string, or packet object'
        } as APIResponse;
        return;
      }
      let parsedPackets: ParsedPacket[] = [];
      if (body.packets && Array.isArray(body.packets)) {
        const packets = body.packets as NetworkPacket[];
        parsedPackets = protocolParser.parsePackets(packets);
      } else if (body.packet) {
        const packet = body.packet as NetworkPacket;
        parsedPackets = [protocolParser.parsePacket(packet)];
      } else if (body.rawData) {
        const rawBuffer = Buffer.from(body.rawData, 'hex');
        const { protocol, data } = protocolParser.autoDetectAndParse(
          rawBuffer,
          body.sourcePort,
          body.destinationPort
        );
        const dummyPacket: NetworkPacket = {
          id: 'manual-' + Date.now(),
          timestamp: Date.now(),
          protocol,
          sourceIp: body.sourceIp || '0.0.0.0',
          sourcePort: body.sourcePort || 0,
          destinationIp: body.destinationIp || '0.0.0.0',
          destinationPort: body.destinationPort || 0,
          length: rawBuffer.length,
          rawData: body.rawData,
          direction: body.direction || 'unknown',
          interfaceId: body.interfaceId || 'manual'
        };
        parsedPackets = [{
          ...dummyPacket,
          parsedData: data,
          parsingSuccess: !data.error,
          parsingError: data.error
        }];
      }
      if (body.forward !== false && parsedPackets.length > 0) {
        await this.sendToMirrorForward(parsedPackets);
      }
      ctx.body = {
        success: true,
        data: parsedPackets.length === 1 ? parsedPackets[0] : parsedPackets,
        message: `Successfully parsed ${parsedPackets.length} packet(s)`
      } as APIResponse;
    } catch (error) {
      logger.error('Error parsing packets:', error);
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      } as APIResponse;
    }
  }

  public async generatePackets(ctx: Context): Promise<void> {
    try {
      const countParam = ctx.query.count as string;
      const iface = ctx.query.iface as string;
      const count = Math.min(parseInt(countParam || '100'), 1000);
      if (isNaN(count) || count <= 0) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          error: 'Invalid count parameter. Must be a positive integer (max 1000)'
        } as APIResponse;
        return;
      }
      const packets = packetCaptureService.generateBatchPackets(count, iface);
      const parsedPackets = protocolParser.parsePackets(packets);
      if (ctx.query.forward !== 'false') {
        await this.sendToMirrorForward(parsedPackets);
      }
      ctx.body = {
        success: true,
        data: {
          total: parsedPackets.length,
          packets: parsedPackets.slice(0, 20),
          protocolStats: this.getProtocolStats(parsedPackets)
        },
        message: `Generated and parsed ${parsedPackets.length} packets`
      } as APIResponse;
    } catch (error) {
      logger.error('Error generating packets:', error);
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      } as APIResponse;
    }
  }

  private getProtocolStats(packets: ParsedPacket[]): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const packet of packets) {
      stats[packet.protocol] = (stats[packet.protocol] || 0) + 1;
    }
    return stats;
  }

  public async healthCheck(ctx: Context): Promise<void> {
    try {
      ctx.body = {
        success: true,
        data: {
          status: 'healthy',
          service: 'packet-parser',
          timestamp: Date.now(),
          uptime: process.uptime(),
          activeCaptures: packetCaptureService.getAllCaptureStatuses().length,
          memory: process.memoryUsage()
        }
      } as APIResponse;
    } catch (error) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      } as APIResponse;
    }
  }
}

export default new CaptureController();
