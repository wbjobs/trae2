import { EditLock } from '../../../shared/types';
import { DataStore } from '../../utils/dataStore';
import { config } from '../../config';

export class EditLockManager {
  private store: DataStore;
  private lockTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.store = DataStore.getInstance();
  }

  acquireLock(specimenId: string, userId: string, userName: string): EditLock | null {
    const existingLock = this.store.editLocks.get(specimenId);
    const now = new Date();

    if (existingLock && existingLock.userId !== userId) {
      if (existingLock.expiresAt > now) {
        return existingLock;
      }
      this.releaseLock(specimenId, existingLock.userId);
    }

    if (existingLock && existingLock.userId === userId) {
      this.renewLock(specimenId, userId);
      return this.store.editLocks.get(specimenId) || null;
    }

    const lock: EditLock = {
      specimenId,
      userId,
      userName,
      acquiredAt: now,
      expiresAt: new Date(now.getTime() + config.editLockTimeout * 1000)
    };

    this.store.editLocks.set(specimenId, lock);

    this.scheduleLockExpiry(specimenId);

    return lock;
  }

  renewLock(specimenId: string, userId: string): boolean {
    const lock = this.store.editLocks.get(specimenId);
    if (!lock || lock.userId !== userId) {
      return false;
    }

    const now = new Date();
    lock.expiresAt = new Date(now.getTime() + config.editLockTimeout * 1000);

    this.scheduleLockExpiry(specimenId);

    return true;
  }

  releaseLock(specimenId: string, userId: string): boolean {
    const lock = this.store.editLocks.get(specimenId);
    if (!lock) {
      return true;
    }

    if (lock.userId !== userId) {
      return false;
    }

    const timeout = this.lockTimeouts.get(specimenId);
    if (timeout) {
      clearTimeout(timeout);
      this.lockTimeouts.delete(specimenId);
    }

    this.store.editLocks.delete(specimenId);
    return true;
  }

  getLock(specimenId: string): EditLock | undefined {
    const lock = this.store.editLocks.get(specimenId);
    if (lock && lock.expiresAt < new Date()) {
      this.store.editLocks.delete(specimenId);
      return undefined;
    }
    return lock;
  }

  hasLock(specimenId: string, userId: string): boolean {
    const lock = this.getLock(specimenId);
    return lock?.userId === userId;
  }

  forceReleaseLock(specimenId: string): boolean {
    const timeout = this.lockTimeouts.get(specimenId);
    if (timeout) {
      clearTimeout(timeout);
      this.lockTimeouts.delete(specimenId);
    }
    this.store.editLocks.delete(specimenId);
    return true;
  }

  private scheduleLockExpiry(specimenId: string): void {
    const existingTimeout = this.lockTimeouts.get(specimenId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(() => {
      this.store.editLocks.delete(specimenId);
      this.lockTimeouts.delete(specimenId);
    }, config.editLockTimeout * 1000);

    this.lockTimeouts.set(specimenId, timeout);
  }

  getAllLocks(): EditLock[] {
    return Array.from(this.store.editLocks.values()).filter(
      lock => lock.expiresAt > new Date()
    );
  }

  getLocksByUser(userId: string): EditLock[] {
    return this.getAllLocks().filter(lock => lock.userId === userId);
  }

  cleanupExpiredLocks(): void {
    const now = new Date();
    for (const [specimenId, lock] of this.store.editLocks) {
      if (lock.expiresAt < now) {
        this.store.editLocks.delete(specimenId);
        const timeout = this.lockTimeouts.get(specimenId);
        if (timeout) {
          clearTimeout(timeout);
          this.lockTimeouts.delete(specimenId);
        }
      }
    }
  }
}
