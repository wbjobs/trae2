import { ParameterDefinition, ParameterValue, DeviceDescriptor } from '../../shared/types';
import { Result, ok, err } from '../../shared/result';
import { configPersistence } from './ConfigPersistenceService';

export interface ParameterGroup {
  name: string;
  parameters: ParameterDefinition[];
}

export class ParameterConfigurationService {
  private parameterDefinitions: Map<string, Map<string, ParameterDefinition>> = new Map();
  private pendingWrites: Map<string, Map<string, { value: number | boolean | string; timestamp: number }>> =
    new Map();
  private writeInProgress: Set<string> = new Set();

  registerDevice(device: DeviceDescriptor, definitions: ParameterDefinition[]): Result<void> {
    const defMap = new Map<string, ParameterDefinition>();
    for (const def of definitions) {
      defMap.set(def.id, def);
    }
    this.parameterDefinitions.set(device.id, defMap);

    const existingProfile = configPersistence.getProfile(device.id);
    if (!existingProfile) {
      configPersistence.createProfile(device.id, device.name, definitions);
    }

    this.pendingWrites.set(device.id, new Map());

    return ok(undefined);
  }

  unregisterDevice(deviceId: string): void {
    this.parameterDefinitions.delete(deviceId);
    this.pendingWrites.delete(deviceId);
    this.writeInProgress.delete(deviceId);
  }

  getDefinitions(deviceId: string): ParameterDefinition[] {
    const defs = this.parameterDefinitions.get(deviceId);
    return defs ? Array.from(defs.values()) : [];
  }

  getDefinition(deviceId: string, paramId: string): ParameterDefinition | null {
    const defs = this.parameterDefinitions.get(deviceId);
    return defs?.get(paramId) || null;
  }

  validateValue(deviceId: string, paramId: string, value: number | boolean | string): Result<void> {
    const def = this.getDefinition(deviceId, paramId);
    if (!def) {
      return err('PARAM_NOT_FOUND', `Parameter ${paramId} not found for device ${deviceId}`);
    }

    switch (def.type) {
      case 'int':
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          return err('INVALID_VALUE', `Parameter ${paramId} must be an integer`);
        }
        break;
      case 'float':
        if (typeof value !== 'number') {
          return err('INVALID_VALUE', `Parameter ${paramId} must be a number`);
        }
        break;
      case 'bool':
        if (typeof value !== 'boolean') {
          return err('INVALID_VALUE', `Parameter ${paramId} must be a boolean`);
        }
        break;
      case 'enum':
        if (def.options && !def.options.some((o) => o.value === value)) {
          return err('INVALID_VALUE', `Parameter ${paramId} has invalid enum value`);
        }
        break;
      case 'string':
        if (typeof value !== 'string') {
          return err('INVALID_VALUE', `Parameter ${paramId} must be a string`);
        }
        break;
    }

    if (def.type === 'int' || def.type === 'float') {
      const numValue = value as number;
      if (def.min !== undefined && numValue < def.min) {
        return err('VALUE_TOO_LOW', `Parameter ${paramId} value ${numValue} is below minimum ${def.min}`);
      }
      if (def.max !== undefined && numValue > def.max) {
        return err('VALUE_TOO_HIGH', `Parameter ${paramId} value ${numValue} is above maximum ${def.max}`);
      }
    }

    return ok(undefined);
  }

  normalizeValue(deviceId: string, paramId: string, value: number | boolean | string): number | boolean | string {
    const def = this.getDefinition(deviceId, paramId);
    if (!def) return value;

    if ((def.type === 'int' || def.type === 'float') && typeof value === 'number') {
      if (def.min !== undefined && value < def.min) return def.min;
      if (def.max !== undefined && value > def.max) return def.max;

      if (def.type === 'int') {
        return Math.round(value);
      }

      if (def.step !== undefined) {
        return Math.round(value / def.step) * def.step;
      }
    }

    return value;
  }

  queueWrite(deviceId: string, paramId: string, value: number | boolean | string): Result<ParameterValue> {
    const validation = this.validateValue(deviceId, paramId, value);
    if (!validation.ok) {
      return validation;
    }

    const normalizedValue = this.normalizeValue(deviceId, paramId, value);

    const devicePending = this.pendingWrites.get(deviceId);
    if (!devicePending) {
      return err('DEVICE_NOT_REGISTERED', `Device ${deviceId} not registered`);
    }

    devicePending.set(paramId, { value: normalizedValue, timestamp: Date.now() });

    const persisted = configPersistence.updateParameter(deviceId, paramId, normalizedValue);
    if (!persisted.ok) {
      return persisted;
    }

    return ok(persisted.data);
  }

  getPendingWrites(deviceId: string): Array<{ id: string; value: number | boolean | string }> {
    const devicePending = this.pendingWrites.get(deviceId);
    if (!devicePending) return [];

    return Array.from(devicePending.entries()).map(([id, entry]) => ({ id, value: entry.value }));
  }

  clearPendingWrites(deviceId: string, paramIds?: string[]): void {
    const devicePending = this.pendingWrites.get(deviceId);
    if (!devicePending) return;

    if (paramIds) {
      for (const id of paramIds) {
        devicePending.delete(id);
      }
    } else {
      devicePending.clear();
    }
  }

  getStoredParameter(deviceId: string, paramId: string): ParameterValue | null {
    return configPersistence.getParameter(deviceId, paramId);
  }

  getAllStoredParameters(deviceId: string): Record<string, ParameterValue> | null {
    return configPersistence.getAllParameters(deviceId);
  }

  groupParameters(deviceId: string): ParameterGroup[] {
    const defs = this.getDefinitions(deviceId);
    const groups: Map<string, ParameterDefinition[]> = new Map();
    const ungrouped: ParameterDefinition[] = [];

    for (const def of defs) {
      const groupName = def.group || '';
      if (groupName) {
        if (!groups.has(groupName)) {
          groups.set(groupName, []);
        }
        groups.get(groupName)!.push(def);
      } else {
        ungrouped.push(def);
      }
    }

    const result: ParameterGroup[] = [];
    for (const [name, parameters] of groups.entries()) {
      result.push({ name, parameters });
    }
    if (ungrouped.length > 0) {
      result.push({ name: 'General', parameters: ungrouped });
    }

    return result;
  }

  isWriteInProgress(deviceId: string): boolean {
    return this.writeInProgress.has(deviceId);
  }

  setWriteInProgress(deviceId: string, inProgress: boolean): void {
    if (inProgress) {
      this.writeInProgress.add(deviceId);
    } else {
      this.writeInProgress.delete(deviceId);
    }
  }

  exportConfig(deviceId: string, filePath: string): Result<string> {
    return configPersistence.exportProfile(deviceId, filePath);
  }

  importConfig(filePath: string): Result<{ deviceId: string; parameters: ParameterValue[] }> {
    const result = configPersistence.importProfile(filePath);
    if (!result.ok) {
      return result;
    }

    const profile = result.data;
    const parameters = Object.values(profile.parameters);

    return ok({ deviceId: profile.deviceId, parameters });
  }

  resetToDefaults(deviceId: string): Result<ParameterValue[]> {
    const defs = this.getDefinitions(deviceId);
    if (defs.length === 0) {
      return err('DEVICE_NOT_REGISTERED', `Device ${deviceId} not registered`);
    }

    const results: ParameterValue[] = [];
    for (const def of defs) {
      const result = this.queueWrite(deviceId, def.id, def.defaultValue);
      if (result.ok) {
        results.push(result.data);
      }
    }

    return ok(results);
  }
}

export const parameterConfig = new ParameterConfigurationService();
