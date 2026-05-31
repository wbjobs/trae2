import { EventEmitter } from 'events';
import { ITransport } from './ITransport';
import { DeviceDescriptor, ParameterValue } from '../../shared/types';
import { Result, ok, err } from '../../shared/result';

export interface PooledConnection {
  device: DeviceDescriptor;
  transport: ITransport;
  acquiredAt: number;
  lastUsedAt: number;
  inUse: boolean;
  lockId: string | null;
}

export interface AcquireOptions {
  timeout?: number;
  lockId?: string;
}

export class ConnectionPool extends EventEmitter {
  private pool: Map<string, PooledConnection> = new Map();
  private maxConnections: number = 10;
  private acquireTimeout: number = 30000;
  private maxIdleTime: number = 300000;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private pendingAcquisitions: Map<string, Array<(conn: PooledConnection | null) => void>> =
    new Map();

  constructor(maxConnections = 10) {
    super();
    this.maxConnections = maxConnections;
    this.startCleanup();
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupIdleConnections();
    }, 60000);
  }

  private cleanupIdleConnections(): void {
    const now = Date.now();
    for (const [deviceId, conn] of this.pool.entries()) {
      if (!conn.inUse && now - conn.lastUsedAt > this.maxIdleTime) {
        this.release(deviceId);
        this.emit('connection-evicted', deviceId);
      }
    }
  }

  add(device: DeviceDescriptor, transport: ITransport): Result<void> {
    if (this.pool.size >= this.maxConnections) {
      return err('POOL_FULL', `Connection pool is full (max: ${this.maxConnections})`);
    }

    if (this.pool.has(device.id)) {
      return err('ALREADY_EXISTS', `Connection for device ${device.id} already exists`);
    }

    this.pool.set(device.id, {
      device,
      transport,
      acquiredAt: Date.now(),
      lastUsedAt: Date.now(),
      inUse: false,
      lockId: null,
    });

    this.emit('connection-added', device.id);
    return ok(undefined);
  }

  async acquire(
    deviceId: string,
    options: AcquireOptions = {},
  ): Promise<PooledConnection | null> {
    const timeout = options.timeout || this.acquireTimeout;
    const lockId = options.lockId || `lock-${Date.now()}`;

    const conn = this.pool.get(deviceId);
    if (!conn) {
      return null;
    }

    if (!conn.inUse) {
      conn.inUse = true;
      conn.lockId = lockId;
      conn.lastUsedAt = Date.now();
      return conn;
    }

    return new Promise((resolve) => {
      const queue = this.pendingAcquisitions.get(deviceId) || [];
      queue.push(resolve);
      this.pendingAcquisitions.set(deviceId, queue);

      setTimeout(() => {
        const idx = queue.indexOf(resolve);
        if (idx >= 0) {
          queue.splice(idx, 1);
          resolve(null);
        }
      }, timeout);
    });
  }

  release(deviceId: string, lockId?: string): boolean {
    const conn = this.pool.get(deviceId);
    if (!conn) return false;

    if (lockId && conn.lockId !== lockId) {
      return false;
    }

    conn.inUse = false;
    conn.lockId = null;
    conn.lastUsedAt = Date.now();

    this.processPendingAcquisitions(deviceId);
    this.emit('connection-released', deviceId);

    return true;
  }

  private processPendingAcquisitions(deviceId: string): void {
    const queue = this.pendingAcquisitions.get(deviceId);
    if (!queue || queue.length === 0) return;

    const conn = this.pool.get(deviceId);
    if (!conn || conn.inUse) return;

    const nextResolver = queue.shift();
    if (nextResolver) {
      conn.inUse = true;
      nextResolver(conn);
    }
  }

  async execute<T>(
    deviceId: string,
    fn: (transport: ITransport, device: DeviceDescriptor) => Promise<T> | T,
    options: AcquireOptions = {},
  ): Promise<Result<T>> {
    const conn = await this.acquire(deviceId, options);
    if (!conn) {
      return err('ACQUIRE_FAILED', `Failed to acquire connection for device ${deviceId}`);
    }

    try {
      const result = await fn(conn.transport, conn.device);
      return ok(result);
    } catch (error) {
      return err(
        'EXECUTION_ERROR',
        `Execution failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        error,
      );
    } finally {
      this.release(deviceId, conn.lockId || undefined);
    }
  }

  remove(deviceId: string): boolean {
    const conn = this.pool.get(deviceId);
    if (!conn) return false;

    if (conn.inUse) {
      return false;
    }

    conn.transport.close();
    this.pool.delete(deviceId);
    this.pendingAcquisitions.delete(deviceId);
    this.emit('connection-removed', deviceId);
    return true;
  }

  has(deviceId: string): boolean {
    return this.pool.has(deviceId);
  }

  get(deviceId: string): PooledConnection | undefined {
    return this.pool.get(deviceId);
  }

  getAll(): PooledConnection[] {
    return Array.from(this.pool.values());
  }

  size(): number {
    return this.pool.size;
  }

  activeCount(): number {
    return Array.from(this.pool.values()).filter((c) => c.inUse).length;
  }

  idleCount(): number {
    return Array.from(this.pool.values()).filter((c) => !c.inUse).length;
  }

  async closeAll(): Promise<void> {
    for (const conn of this.pool.values()) {
      try {
        await conn.transport.close();
      } catch {
        // Ignore close errors
      }
    }
    this.pool.clear();
    this.pendingAcquisitions.clear();

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

export const connectionPool = new ConnectionPool();
