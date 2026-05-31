import { SpeakerPreset, SpeakerType } from './types';

export const SPEAKER_PRESETS: Record<SpeakerType, SpeakerPreset> = {
    'line-array': {
        type: 'line-array',
        name: '线阵列音箱',
        icon: '🔊',
        defaultPower: 1000,
        defaultDirectivity: 60,
        frequencyRange: { min: 80, max: 18000 }
    },
    'point-source': {
        type: 'point-source',
        name: '点声源',
        icon: '🔉',
        defaultPower: 500,
        defaultDirectivity: 90,
        frequencyRange: { min: 60, max: 16000 }
    },
    'subwoofer': {
        type: 'subwoofer',
        name: '超低音',
        icon: '🔈',
        defaultPower: 1500,
        defaultDirectivity: 180,
        frequencyRange: { min: 20, max: 250 }
    },
    'fill': {
        type: 'fill',
        name: '补声音箱',
        icon: '🎵',
        defaultPower: 200,
        defaultDirectivity: 120,
        frequencyRange: { min: 100, max: 15000 }
    }
};
