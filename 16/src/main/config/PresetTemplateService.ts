import { ParameterDefinition, ParameterValue, DeviceCategory } from '../../shared/types';

export interface PresetTemplate {
  id: string;
  name: string;
  description: string;
  category: DeviceCategory | 'all';
  icon: string;
  parameters: Array<{ paramId: string; value: number | boolean | string }>;
  isSystem: boolean;
  createdAt: number;
}

export const FACTORY_PRESETS: PresetTemplate[] = [
  {
    id: 'keyboard-gaming',
    name: '游戏模式',
    description: '低延迟、高响应，适合竞技游戏',
    category: 'keyboard',
    icon: '🎮',
    isSystem: true,
    createdAt: Date.now(),
    parameters: [
      { paramId: 'key_repeat_rate', value: 15 },
      { paramId: 'key_delay', value: 200 },
      { paramId: 'debounce_time', value: 2 },
      { paramId: 'rgb_effect', value: 'reactive' },
      { paramId: 'rgb_brightness', value: 100 },
    ],
  },
  {
    id: 'keyboard-office',
    name: '办公模式',
    description: '平衡舒适与效率，适合长时间输入',
    category: 'keyboard',
    icon: '📝',
    isSystem: true,
    createdAt: Date.now(),
    parameters: [
      { paramId: 'key_repeat_rate', value: 50 },
      { paramId: 'key_delay', value: 500 },
      { paramId: 'debounce_time', value: 8 },
      { paramId: 'rgb_effect', value: 'static' },
      { paramId: 'rgb_brightness', value: 40 },
    ],
  },
  {
    id: 'keyboard-night',
    name: '夜间模式',
    description: '静音、低光，适合夜间使用',
    category: 'keyboard',
    icon: '🌙',
    isSystem: true,
    createdAt: Date.now(),
    parameters: [
      { paramId: 'debounce_time', value: 15 },
      { paramId: 'rgb_enabled', value: false },
    ],
  },
  {
    id: 'mouse-fps',
    name: 'FPS 游戏',
    description: '高精度、低加速，适合射击游戏',
    category: 'mouse',
    icon: '🎯',
    isSystem: true,
    createdAt: Date.now(),
    parameters: [
      { paramId: 'dpi', value: 800 },
      { paramId: 'polling_rate', value: 1000 },
      { paramId: 'sensitivity', value: 1.0 },
      { paramId: 'angle_snapping', value: false },
      { paramId: 'lift_off_distance', value: 2 },
    ],
  },
  {
    id: 'mouse-moba',
    name: 'MOBA 游戏',
    description: '高灵敏度、快速响应，适合多人竞技',
    category: 'mouse',
    icon: '⚔️',
    isSystem: true,
    createdAt: Date.now(),
    parameters: [
      { paramId: 'dpi', value: 1600 },
      { paramId: 'polling_rate', value: 1000 },
      { paramId: 'sensitivity', value: 1.5 },
      { paramId: 'scroll_speed', value: 10 },
    ],
  },
  {
    id: 'mouse-productivity',
    name: '办公效率',
    description: '平衡精准与舒适，适合日常办公',
    category: 'mouse',
    icon: '💼',
    isSystem: true,
    createdAt: Date.now(),
    parameters: [
      { paramId: 'dpi', value: 1200 },
      { paramId: 'polling_rate', value: 250 },
      { paramId: 'sensitivity', value: 1.0 },
      { paramId: 'scroll_speed', value: 5 },
    ],
  },
  {
    id: 'industrial-high-speed',
    name: '高速采样',
    description: '最高采样率，适合实时监控',
    category: 'industrial-io',
    icon: '⚡',
    isSystem: true,
    createdAt: Date.now(),
    parameters: [
      { paramId: 'sampling_rate', value: 1000 },
      { paramId: 'baud_rate', value: 115200 },
      { paramId: 'filter_enabled', value: false },
    ],
  },
  {
    id: 'industrial-stable',
    name: '稳定模式',
    description: '低采样率+滤波，适合工业环境',
    category: 'industrial-io',
    icon: '🛡️',
    isSystem: true,
    createdAt: Date.now(),
    parameters: [
      { paramId: 'sampling_rate', value: 50 },
      { paramId: 'baud_rate', value: 9600 },
      { paramId: 'filter_enabled', value: true },
    ],
  },
  {
    id: 'universal-silent',
    name: '静音节能',
    description: '关闭所有灯光与特效',
    category: 'all',
    icon: '🔇',
    isSystem: true,
    createdAt: Date.now(),
    parameters: [
      { paramId: 'rgb_enabled', value: false },
    ],
  },
  {
    id: 'universal-default',
    name: '恢复出厂',
    description: '恢复所有参数为默认值',
    category: 'all',
    icon: '🔄',
    isSystem: true,
    createdAt: Date.now(),
    parameters: [],
  },
];

export class PresetTemplateService {
  private customPresets: Map<string, PresetTemplate> = new Map();

  getPresetsForCategory(category: DeviceCategory): PresetTemplate[] {
    const systemPresets = FACTORY_PRESETS.filter(
      (p) => p.category === category || p.category === 'all',
    );
    const customPresets = Array.from(this.customPresets.values()).filter(
      (p) => p.category === category || p.category === 'all',
    );
    return [...systemPresets, ...customPresets];
  }

  getAllPresets(): PresetTemplate[] {
    return [...FACTORY_PRESETS, ...this.customPresets.values()];
  }

  getPreset(id: string): PresetTemplate | undefined {
    return FACTORY_PRESETS.find((p) => p.id === id) || this.customPresets.get(id);
  }

  createCustomPreset(
    name: string,
    description: string,
    category: DeviceCategory | 'all',
    icon: string,
    parameters: Array<{ paramId: string; value: number | boolean | string }>,
  ): PresetTemplate {
    const id = `custom-${Date.now()}`;
    const preset: PresetTemplate = {
      id,
      name,
      description,
      category,
      icon,
      parameters,
      isSystem: false,
      createdAt: Date.now(),
    };
    this.customPresets.set(id, preset);
    return preset;
  }

  deleteCustomPreset(id: string): boolean {
    return this.customPresets.delete(id);
  }

  createPresetFromCurrent(
    name: string,
    description: string,
    category: DeviceCategory,
    currentValues: Record<string, ParameterValue>,
    definitions: ParameterDefinition[],
  ): PresetTemplate {
    const parameters = definitions.map((def) => ({
      paramId: def.id,
      value: currentValues[def.id]?.value ?? def.defaultValue,
    }));
    return this.createCustomPreset(name, description, category, '💾', parameters);
  }

  applyPreset(
    preset: PresetTemplate,
    definitions: ParameterDefinition[],
  ): Array<{ paramId: string; value: number | boolean | string }> {
    const result: Array<{ paramId: string; value: number | boolean | string }> = [];

    if (preset.id === 'universal-default') {
      for (const def of definitions) {
        result.push({ paramId: def.id, value: def.defaultValue });
      }
    } else {
      const defMap = new Map(definitions.map((d) => [d.id, d]));
      for (const param of preset.parameters) {
        if (defMap.has(param.paramId)) {
          result.push({ paramId: param.paramId, value: param.value });
        }
      }
    }

    return result;
  }
}

export const presetService = new PresetTemplateService();
