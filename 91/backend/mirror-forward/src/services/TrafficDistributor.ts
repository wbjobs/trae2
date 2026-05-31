import { createHash } from 'crypto';
import { logger } from 'shared/index';
import {
  TrafficSource,
  DistributionRule,
  DistributionStats,
  RawPacket,
  ParsedPacket,
} from 'shared/index';

type PacketType = RawPacket | ParsedPacket;

interface DistributionResult {
  destination: string;
  shouldDrop: boolean;
  reason?: string;
}

interface BatchDistributionResult<T extends PacketType> {
  distributed: Array<{ message: T; destination: string }>;
  dropped: Array<{ message: T; reason: string }>;
}

export class TrafficDistributor {
  private sources: Map<string, TrafficSource> = new Map();
  private rules: Map<string, DistributionRule> = new Map();
  private stats: DistributionStats;
  private roundRobinIndex: Map<string, number> = new Map();
  private lock = Promise.resolve();

  constructor() {
    this.stats = {
      totalDistributed: 0,
      bySource: new Map(),
      byDestination: new Map(),
      currentLoad: new Map(),
    };
  }

  private async acquire(): Promise<() => void> {
    const release = () => {};
    const prevLock = this.lock;
    this.lock = this.lock.then(() => {});
    await prevLock;
    return release;
  }

  registerSource(source: TrafficSource): void {
    this.sources.set(source.id, source);
    this.roundRobinIndex.set(source.id, 0);
    logger.info(`[TrafficDistributor] Registered source: ${source.id} (${source.name})`);
  }

  unregisterSource(sourceId: string): boolean {
    const existed = this.sources.has(sourceId);
    this.sources.delete(sourceId);
    this.roundRobinIndex.delete(sourceId);
    if (existed) {
      logger.info(`[TrafficDistributor] Unregistered source: ${sourceId}`);
    }
    return existed;
  }

  updateSource(sourceId: string, updates: Partial<TrafficSource>): boolean {
    const source = this.sources.get(sourceId);
    if (!source) return false;

    Object.assign(source, updates);
    logger.debug(`[TrafficDistributor] Updated source: ${sourceId}`);
    return true;
  }

  getSource(sourceId: string): TrafficSource | undefined {
    return this.sources.get(sourceId);
  }

  getAllSources(): TrafficSource[] {
    return Array.from(this.sources.values());
  }

  addRule(rule: DistributionRule): void {
    this.rules.set(rule.id, rule);
    logger.info(`[TrafficDistributor] Added rule: ${rule.id} (${rule.name}, type: ${rule.type})`);
  }

  removeRule(ruleId: string): boolean {
    const existed = this.rules.has(ruleId);
    this.rules.delete(ruleId);
    if (existed) {
      logger.info(`[TrafficDistributor] Removed rule: ${ruleId}`);
    }
    return existed;
  }

  getRule(ruleId: string): DistributionRule | undefined {
    return this.rules.get(ruleId);
  }

  getAllRules(): DistributionRule[] {
    return Array.from(this.rules.values());
  }

  private findApplicableRule(sourceId: string): DistributionRule | undefined {
    for (const rule of this.rules.values()) {
      if (rule.enabled && rule.sources.includes(sourceId)) {
        return rule;
      }
    }
    return undefined;
  }

  private checkBandwidthLimit(sourceId: string, packetSize: number): boolean {
    const source = this.sources.get(sourceId);
    if (!source) return true;

    if (source.status === 'overloaded') {
      return false;
    }

    const newBandwidth = source.currentBandwidth + packetSize;
    if (newBandwidth > source.maxBandwidth) {
      source.status = 'overloaded';
      logger.warn(`[TrafficDistributor] Source ${sourceId} exceeded bandwidth limit`);
      return false;
    }

    source.currentBandwidth = newBandwidth;
    source.lastSeen = Date.now();
    return true;
  }

  hashMessage(message: PacketType, hashKey: NonNullable<DistributionRule['hashKey']>): string {
    let keyValue = '';

    if ('srcIp' in message) {
      const raw = message as RawPacket;
      switch (hashKey) {
        case 'source_ip':
          keyValue = raw.srcIp;
          break;
        case 'dest_ip':
          keyValue = raw.dstIp;
          break;
        case 'device_id':
          keyValue = raw.sourceId;
          break;
        case 'signaling_type':
          keyValue = raw.protocol;
          break;
      }
    } else {
      const parsed = message as ParsedPacket;
      switch (hashKey) {
        case 'source_ip':
          keyValue = parsed.sourceIp;
          break;
        case 'dest_ip':
          keyValue = parsed.destinationIp;
          break;
        case 'device_id':
          keyValue = parsed.interfaceId;
          break;
        case 'signaling_type':
          keyValue = parsed.protocol;
          break;
      }
    }

    const hash = createHash('md5').update(keyValue).digest('hex');
    return hash;
  }

  private getConsistentHashDestination(
    message: PacketType,
    destinations: string[],
    hashKey: NonNullable<DistributionRule['hashKey']>
  ): string {
    const hash = this.hashMessage(message, hashKey);
    const hashNum = parseInt(hash.substring(0, 8), 16);
    const index = hashNum % destinations.length;
    return destinations[index];
  }

  private getWeightedDestination(sourceId: string, destinations: string[]): string {
    const source = this.sources.get(sourceId);
    if (!source || destinations.length === 0) {
      return destinations[0] || 'default';
    }

    let totalWeight = 0;
    const weightedDestinations = destinations.map((dest, index) => {
      const weight = source.weight + index;
      totalWeight += weight;
      return { dest, weight, cumulative: totalWeight };
    });

    const random = Math.random() * totalWeight;
    for (const wd of weightedDestinations) {
      if (random <= wd.cumulative) {
        return wd.dest;
      }
    }

    return destinations[destinations.length - 1];
  }

  private getRoundRobinDestination(sourceId: string, destinations: string[]): string {
    if (destinations.length === 0) return 'default';

    let index = this.roundRobinIndex.get(sourceId) || 0;
    const destination = destinations[index % destinations.length];
    index = (index + 1) % destinations.length;
    this.roundRobinIndex.set(sourceId, index);

    return destination;
  }

  private getPriorityDestination(
    message: PacketType,
    destinations: string[],
    sourceId: string
  ): string {
    const source = this.sources.get(sourceId);
    if (!source) {
      return destinations[0] || 'default';
    }

    const sortedDestinations = [...destinations].sort((a, b) => {
      const loadA = this.stats.currentLoad.get(a) || 0;
      const loadB = this.stats.currentLoad.get(b) || 0;
      return loadA - loadB;
    });

    return sortedDestinations[0];
  }

  private getPacketSize(message: PacketType): number {
    if ('payloadLength' in message) {
      return message.payloadLength;
    }
    if ('length' in message) {
      return message.length;
    }
    return JSON.stringify(message).length;
  }

  private selectDestination(
    message: PacketType,
    rule: DistributionRule
  ): string {
    const { type, destinations, hashKey } = rule;

    switch (type) {
      case 'hash':
        return this.getConsistentHashDestination(
          message,
          destinations,
          hashKey || 'source_ip'
        );
      case 'weighted':
        return this.getWeightedDestination(rule.sources[0], destinations);
      case 'priority':
        return this.getPriorityDestination(message, destinations, rule.sources[0]);
      case 'round_robin':
        return this.getRoundRobinDestination(rule.sources[0], destinations);
      default:
        return destinations[0] || 'default';
    }
  }

  async distributeMessage(
    message: PacketType,
    sourceId: string
  ): Promise<DistributionResult> {
    const release = await this.acquire();

    try {
      const packetSize = this.getPacketSize(message);

      if (!this.checkBandwidthLimit(sourceId, packetSize)) {
        const sourceStats = this.stats.bySource.get(sourceId) || {
          packets: 0,
          bytes: 0,
          dropped: 0,
        };
        sourceStats.dropped++;
        this.stats.bySource.set(sourceId, sourceStats);

        return {
          destination: '',
          shouldDrop: true,
          reason: 'Bandwidth limit exceeded',
        };
      }

      const rule = this.findApplicableRule(sourceId);
      if (!rule) {
        return {
          destination: 'default',
          shouldDrop: false,
        };
      }

      const destination = this.selectDestination(message, rule);

      this.stats.totalDistributed++;

      const sourceStats = this.stats.bySource.get(sourceId) || {
        packets: 0,
        bytes: 0,
        dropped: 0,
      };
      sourceStats.packets++;
      sourceStats.bytes += packetSize;
      this.stats.bySource.set(sourceId, sourceStats);

      const destStats = this.stats.byDestination.get(destination) || {
        packets: 0,
        bytes: 0,
      };
      destStats.packets++;
      destStats.bytes += packetSize;
      this.stats.byDestination.set(destination, destStats);

      const currentLoad = this.stats.currentLoad.get(destination) || 0;
      this.stats.currentLoad.set(destination, currentLoad + 1);

      return {
        destination,
        shouldDrop: false,
      };
    } finally {
      release();
    }
  }

  async distributeBatch<T extends PacketType>(
    messages: T[],
    sourceId: string
  ): Promise<BatchDistributionResult<T>> {
    const distributed: Array<{ message: T; destination: string }> = [];
    const dropped: Array<{ message: T; reason: string }> = [];

    for (const message of messages) {
      const result = await this.distributeMessage(message, sourceId);
      if (result.shouldDrop) {
        dropped.push({ message, reason: result.reason || 'Unknown' });
      } else {
        distributed.push({ message, destination: result.destination });
      }
    }

    return { distributed, dropped };
  }

  getStats(): DistributionStats {
    return {
      ...this.stats,
      bySource: new Map(this.stats.bySource),
      byDestination: new Map(this.stats.byDestination),
      currentLoad: new Map(this.stats.currentLoad),
    };
  }

  resetStats(): void {
    this.stats = {
      totalDistributed: 0,
      bySource: new Map(),
      byDestination: new Map(),
      currentLoad: new Map(),
    };
    logger.info('[TrafficDistributor] Statistics reset');
  }

  resetBandwidthUsage(): void {
    for (const source of this.sources.values()) {
      source.currentBandwidth = 0;
      if (source.status === 'overloaded') {
        source.status = 'active';
        logger.debug(`[TrafficDistributor] Source ${source.id} recovered from overload`);
      }
    }

    this.stats.currentLoad.clear();
  }

  startBandwidthResetInterval(intervalMs: number = 1000): NodeJS.Timeout {
    return setInterval(() => {
      this.resetBandwidthUsage();
    }, intervalMs);
  }
}

export const trafficDistributor = new TrafficDistributor();
export default trafficDistributor;
