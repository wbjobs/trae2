import { Context, Next } from 'koa';
import { ValidationError, logger } from 'shared/index';
import { RawPacket, ParsedPacket } from 'shared/index';

const VALID_PROTOCOLS = ['tcp', 'udp', 'http', 'https', 'sip', 'rtp', 'other'] as const;

export function validateRawPacket(ctx: Context, next: Next): Promise<void> {
  const body = ctx.request.body as RawPacket;

  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a JSON object');
  }

  const errors: string[] = [];

  if (!body.id || typeof body.id !== 'string') {
    errors.push('Field "id" is required and must be a string');
  }

  if (!body.sourceId || typeof body.sourceId !== 'string') {
    errors.push('Field "sourceId" is required and must be a string');
  }

  if (body.timestamp === undefined || typeof body.timestamp !== 'number' || body.timestamp <= 0) {
    errors.push('Field "timestamp" is required and must be a positive number');
  }

  if (!body.protocol || !VALID_PROTOCOLS.includes(body.protocol as typeof VALID_PROTOCOLS[number])) {
    errors.push(`Field "protocol" is required and must be one of: ${VALID_PROTOCOLS.join(', ')}`);
  }

  if (!body.srcIp || typeof body.srcIp !== 'string') {
    errors.push('Field "srcIp" is required and must be a string');
  }

  if (body.srcPort === undefined || !Number.isInteger(body.srcPort) || body.srcPort < 0 || body.srcPort > 65535) {
    errors.push('Field "srcPort" is required and must be a valid port number (0-65535)');
  }

  if (!body.dstIp || typeof body.dstIp !== 'string') {
    errors.push('Field "dstIp" is required and must be a string');
  }

  if (body.dstPort === undefined || !Number.isInteger(body.dstPort) || body.dstPort < 0 || body.dstPort > 65535) {
    errors.push('Field "dstPort" is required and must be a valid port number (0-65535)');
  }

  if (!body.payload || typeof body.payload !== 'string') {
    errors.push('Field "payload" is required and must be a string');
  }

  if (body.payloadLength === undefined || typeof body.payloadLength !== 'number' || body.payloadLength < 0) {
    errors.push('Field "payloadLength" is required and must be a non-negative number');
  }

  if (errors.length > 0) {
    logger.warn(`[Validation] Raw packet validation failed: ${errors.join(', ')}`);
    throw new ValidationError(errors.join('; '));
  }

  return next();
}

export function validateBatchRequest(ctx: Context, next: Next): Promise<void> {
  const body = ctx.request.body as { packets: RawPacket[] };

  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a JSON object');
  }

  if (!Array.isArray(body.packets)) {
    throw new ValidationError('Field "packets" is required and must be an array');
  }

  if (body.packets.length === 0) {
    throw new ValidationError('Field "packets" must contain at least one packet');
  }

  if (body.packets.length > 1000) {
    throw new ValidationError('Field "packets" cannot contain more than 1000 packets per batch');
  }

  const sourceIds = new Set<string>();
  for (let i = 0; i < body.packets.length; i++) {
    const packet = body.packets[i];
    const errors: string[] = [];

    if (!packet.id || typeof packet.id !== 'string') {
      errors.push(`Packet ${i}: "id" is required and must be a string`);
    }

    if (!packet.sourceId || typeof packet.sourceId !== 'string') {
      errors.push(`Packet ${i}: "sourceId" is required and must be a string`);
    } else {
      sourceIds.add(packet.sourceId);
    }

    if (packet.timestamp === undefined || typeof packet.timestamp !== 'number' || packet.timestamp <= 0) {
      errors.push(`Packet ${i}: "timestamp" is required and must be a positive number`);
    }

    if (!packet.protocol || !VALID_PROTOCOLS.includes(packet.protocol as typeof VALID_PROTOCOLS[number])) {
      errors.push(`Packet ${i}: "protocol" must be one of: ${VALID_PROTOCOLS.join(', ')}`);
    }

    if (!packet.srcIp || typeof packet.srcIp !== 'string') {
      errors.push(`Packet ${i}: "srcIp" is required and must be a string`);
    }

    if (packet.srcPort === undefined || !Number.isInteger(packet.srcPort) || packet.srcPort < 0 || packet.srcPort > 65535) {
      errors.push(`Packet ${i}: "srcPort" must be a valid port number (0-65535)`);
    }

    if (!packet.dstIp || typeof packet.dstIp !== 'string') {
      errors.push(`Packet ${i}: "dstIp" is required and must be a string`);
    }

    if (packet.dstPort === undefined || !Number.isInteger(packet.dstPort) || packet.dstPort < 0 || packet.dstPort > 65535) {
      errors.push(`Packet ${i}: "dstPort" must be a valid port number (0-65535)`);
    }

    if (!packet.payload || typeof packet.payload !== 'string') {
      errors.push(`Packet ${i}: "payload" is required and must be a string`);
    }

    if (packet.payloadLength === undefined || typeof packet.payloadLength !== 'number' || packet.payloadLength < 0) {
      errors.push(`Packet ${i}: "payloadLength" must be a non-negative number`);
    }

    if (errors.length > 0) {
      logger.warn(`[Validation] Batch packet validation failed at index ${i}: ${errors.join(', ')}`);
      throw new ValidationError(errors.join('; '));
    }
  }

  logger.debug(`[Validation] Batch request valid, ${body.packets.length} packets from ${sourceIds.size} source(s)`);

  return next();
}

export function validateSource(ctx: Context, next: Next): Promise<void> {
  const sourceId = ctx.get('X-Source-Id');

  if (!sourceId) {
    logger.warn('[Validation] Missing X-Source-Id header');
    throw new ValidationError('Header "X-Source-Id" is required for source identification');
  }

  ctx.state.sourceId = sourceId;
  return next();
}

export function validateParsedPacketRequest(ctx: Context, next: Next): Promise<void> {
  const body = ctx.request.body as { packets: ParsedPacket[] };

  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a JSON object');
  }

  if (!Array.isArray(body.packets)) {
    throw new ValidationError('Field "packets" is required and must be an array');
  }

  if (body.packets.length === 0) {
    throw new ValidationError('Field "packets" must contain at least one packet');
  }

  if (body.packets.length > 1000) {
    throw new ValidationError('Field "packets" cannot contain more than 1000 packets per batch');
  }

  for (let i = 0; i < body.packets.length; i++) {
    const packet = body.packets[i];
    const errors: string[] = [];

    if (!packet.id || typeof packet.id !== 'string') {
      errors.push(`Packet ${i}: "id" is required and must be a string`);
    }

    if (packet.timestamp === undefined || typeof packet.timestamp !== 'number' || packet.timestamp <= 0) {
      errors.push(`Packet ${i}: "timestamp" is required and must be a positive number`);
    }

    if (!packet.sourceIp || typeof packet.sourceIp !== 'string') {
      errors.push(`Packet ${i}: "sourceIp" is required and must be a string`);
    }

    if (packet.sourcePort === undefined || !Number.isInteger(packet.sourcePort) || packet.sourcePort < 0 || packet.sourcePort > 65535) {
      errors.push(`Packet ${i}: "sourcePort" must be a valid port number (0-65535)`);
    }

    if (!packet.destinationIp || typeof packet.destinationIp !== 'string') {
      errors.push(`Packet ${i}: "destinationIp" is required and must be a string`);
    }

    if (packet.destinationPort === undefined || !Number.isInteger(packet.destinationPort) || packet.destinationPort < 0 || packet.destinationPort > 65535) {
      errors.push(`Packet ${i}: "destinationPort" must be a valid port number (0-65535)`);
    }

    if (!packet.rawData || typeof packet.rawData !== 'string') {
      errors.push(`Packet ${i}: "rawData" is required and must be a string`);
    }

    if (packet.length === undefined || typeof packet.length !== 'number' || packet.length < 0) {
      errors.push(`Packet ${i}: "length" must be a non-negative number`);
    }

    if (packet.parsingSuccess === undefined || typeof packet.parsingSuccess !== 'boolean') {
      errors.push(`Packet ${i}: "parsingSuccess" is required and must be a boolean`);
    }

    if (errors.length > 0) {
      logger.warn(`[Validation] Parsed packet validation failed at index ${i}: ${errors.join(', ')}`);
      throw new ValidationError(errors.join('; '));
    }
  }

  logger.debug(`[Validation] Parsed packet request valid, ${body.packets.length} packets`);

  return next();
}
