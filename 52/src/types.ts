export interface Speaker {
    id: string;
    type: SpeakerType;
    name: string;
    x: number;
    y: number;
    rotation: number;
    volume: number;
    delay: number;
    frequencyRange: { min: number; max: number };
    power: number;
    directivity: number;
}

export type SpeakerType = 'line-array' | 'point-source' | 'subwoofer' | 'fill';

export interface SpeakerPreset {
    type: SpeakerType;
    name: string;
    icon: string;
    defaultPower: number;
    defaultDirectivity: number;
    frequencyRange: { min: number; max: number };
}

export interface AcousticParams {
    frequency: number;
    temperature: number;
    humidity: number;
}

export interface SoundFieldPoint {
    x: number;
    y: number;
    spl: number;
}

export interface SoundFieldResult {
    points: SoundFieldPoint[];
    maxSpl: number;
    minSpl: number;
    uniformity: number;
    coverage: number;
}

export interface AudioClip {
    id: string;
    name: string;
    startTime: number;
    duration: number;
    speakerId: string;
    volume: number;
}

export interface RegionMarker {
    id: string;
    name: string;
    type: RegionType;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    priority: number;
    visible: boolean;
    description?: string;
    targetSpl?: number;
}

export type RegionType = 'stage' | 'audience' | 'vip' | 'backstage' | 'custom';

export interface LayoutTemplate {
    id: string;
    name: string;
    description: string;
    category: TemplateCategory;
    thumbnail?: string;
    speakers: Omit<Speaker, 'id'>[];
    regions?: Omit<RegionMarker, 'id'>[];
    createdAt: string;
    isBuiltIn: boolean;
}

export type TemplateCategory = 'concert' | 'theater' | 'conference' | 'wedding' | 'custom';

export interface Project {
    name: string;
    speakers: Speaker[];
    audioClips: AudioClip[];
    acousticParams: AcousticParams;
    regions: RegionMarker[];
    createdAt: string;
    updatedAt: string;
    version?: number;
}

export interface SimulatorConfig {
    host: string;
    port: number;
    enabled: boolean;
}
