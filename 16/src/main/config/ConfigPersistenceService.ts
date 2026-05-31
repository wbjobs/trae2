import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { DeviceProfile, ParameterValue, ParameterDefinition } from '../../shared/types';
import { Result, err, ok } from '../../shared/result';

export class ConfigPersistenceService {
  private baseDir: string;
  private profilesDir: string;
  private inMemoryCache: Map<string, DeviceProfile> = new Map();
  private writeDebounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private debounceMs: number = 300;

  constructor() {
    this.baseDir = this.getAppDataPath();
    this.profilesDir = path.join(this.baseDir, 'profiles');
    this.ensureDirectories();
    this.loadAllProfiles();
  }

  private getAppDataPath(): string {
    try {
      return app.getPath('userData');
    } catch {
      const home = process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || '.';
      return path.join(home, '.hardware-tuner');
    }
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    if (!fs.existsSync(this.profilesDir)) {
      fs.mkdirSync(this.profilesDir, { recursive: true });
    }
  }

  private loadAllProfiles(): void {
    try {
      const files = fs.readdirSync(this.profilesDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(this.profilesDir, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            const profile = JSON.parse(content) as DeviceProfile;
            this.inMemoryCache.set(profile.deviceId, profile);
          } catch {
            // Skip invalid files
          }
        }
      }
    } catch {
      // Directory may not exist yet
    }
  }

  private getProfilePath(deviceId: string): string {
    return path.join(this.profilesDir, `${deviceId}.json`);
  }

  private schedulePersist(deviceId: string): void {
    const existing = this.writeDebounceTimers.get(deviceId);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.persistToDisk(deviceId);
      this.writeDebounceTimers.delete(deviceId);
    }, this.debounceMs);

    this.writeDebounceTimers.set(deviceId, timer);
  }

  private persistToDisk(deviceId: string): void {
    const profile = this.inMemoryCache.get(deviceId);
    if (!profile) return;

    try {
      const filePath = this.getProfilePath(deviceId);
      const content = JSON.stringify(profile, null, 2);
      fs.writeFileSync(filePath, content, 'utf-8');
    } catch (error) {
      console.error(`Failed to persist profile for ${deviceId}:`, error);
    }
  }

  getProfile(deviceId: string): DeviceProfile | null {
    return this.inMemoryCache.get(deviceId) || null;
  }

  createProfile(
    deviceId: string,
    deviceName: string,
    definitions: ParameterDefinition[],
  ): Result<DeviceProfile> {
    try {
      const parameters: Record<string, ParameterValue> = {};

      for (const def of definitions) {
        parameters[def.id] = {
          id: def.id,
          value: def.defaultValue,
          updatedAt: Date.now(),
        };
      }

      const profile: DeviceProfile = {
        deviceId,
        deviceName,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        parameters,
      };

      this.inMemoryCache.set(deviceId, profile);
      this.schedulePersist(deviceId);

      return ok(profile);
    } catch (error) {
      return err(
        'CREATE_PROFILE_FAILED',
        `Failed to create profile: ${error instanceof Error ? error.message : 'unknown error'}`,
        error,
      );
    }
  }

  updateParameter(
    deviceId: string,
    paramId: string,
    value: number | boolean | string,
  ): Result<ParameterValue> {
    let profile = this.inMemoryCache.get(deviceId);

    if (!profile) {
      return err('PROFILE_NOT_FOUND', `Profile not found for device ${deviceId}`);
    }

    const paramValue: ParameterValue = {
      id: paramId,
      value,
      updatedAt: Date.now(),
    };

    profile = {
      ...profile,
      updatedAt: Date.now(),
      parameters: {
        ...profile.parameters,
        [paramId]: paramValue,
      },
    };

    this.inMemoryCache.set(deviceId, profile);
    this.schedulePersist(deviceId);

    return ok(paramValue);
  }

  batchUpdateParameters(
    deviceId: string,
    updates: Array<{ id: string; value: number | boolean | string }>,
  ): Result<ParameterValue[]> {
    let profile = this.inMemoryCache.get(deviceId);

    if (!profile) {
      return err('PROFILE_NOT_FOUND', `Profile not found for device ${deviceId}`);
    }

    const updatedParams: ParameterValue[] = [];
    const newParameters = { ...profile.parameters };

    for (const update of updates) {
      const paramValue: ParameterValue = {
        id: update.id,
        value: update.value,
        updatedAt: Date.now(),
      };
      newParameters[update.id] = paramValue;
      updatedParams.push(paramValue);
    }

    profile = {
      ...profile,
      updatedAt: Date.now(),
      parameters: newParameters,
    };

    this.inMemoryCache.set(deviceId, profile);
    this.schedulePersist(deviceId);

    return ok(updatedParams);
  }

  getParameter(deviceId: string, paramId: string): ParameterValue | null {
    const profile = this.inMemoryCache.get(deviceId);
    return profile?.parameters[paramId] || null;
  }

  getAllParameters(deviceId: string): Record<string, ParameterValue> | null {
    const profile = this.inMemoryCache.get(deviceId);
    return profile?.parameters || null;
  }

  exportProfile(deviceId: string, targetPath: string): Result<string> {
    const profile = this.inMemoryCache.get(deviceId);
    if (!profile) {
      return err('PROFILE_NOT_FOUND', `Profile not found for device ${deviceId}`);
    }

    try {
      const content = JSON.stringify(profile, null, 2);
      fs.writeFileSync(targetPath, content, 'utf-8');
      return ok(targetPath);
    } catch (error) {
      return err(
        'EXPORT_FAILED',
        `Failed to export profile: ${error instanceof Error ? error.message : 'unknown error'}`,
        error,
      );
    }
  }

  importProfile(sourcePath: string): Result<DeviceProfile> {
    try {
      if (!fs.existsSync(sourcePath)) {
        return err('FILE_NOT_FOUND', `Profile file not found: ${sourcePath}`);
      }

      const content = fs.readFileSync(sourcePath, 'utf-8');
      const profile = JSON.parse(content) as DeviceProfile;

      if (!profile.deviceId || !profile.parameters) {
        return err('INVALID_PROFILE', 'Invalid profile format');
      }

      this.inMemoryCache.set(profile.deviceId, {
        ...profile,
        updatedAt: Date.now(),
      });
      this.schedulePersist(profile.deviceId);

      return ok(profile);
    } catch (error) {
      return err(
        'IMPORT_FAILED',
        `Failed to import profile: ${error instanceof Error ? error.message : 'unknown error'}`,
        error,
      );
    }
  }

  deleteProfile(deviceId: string): Result<void> {
    try {
      this.inMemoryCache.delete(deviceId);
      const filePath = this.getProfilePath(deviceId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      const timer = this.writeDebounceTimers.get(deviceId);
      if (timer) {
        clearTimeout(timer);
        this.writeDebounceTimers.delete(deviceId);
      }

      return ok(undefined);
    } catch (error) {
      return err(
        'DELETE_FAILED',
        `Failed to delete profile: ${error instanceof Error ? error.message : 'unknown error'}`,
        error,
      );
    }
  }

  listProfiles(): DeviceProfile[] {
    return Array.from(this.inMemoryCache.values());
  }

  async flushAll(): Promise<void> {
    for (const deviceId of this.inMemoryCache.keys()) {
      this.persistToDisk(deviceId);
    }
    for (const timer of this.writeDebounceTimers.values()) {
      clearTimeout(timer);
    }
    this.writeDebounceTimers.clear();
  }

  getProfilesDir(): string {
    return this.profilesDir;
  }
}

export const configPersistence = new ConfigPersistenceService();
