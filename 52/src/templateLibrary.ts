import { LayoutTemplate, Speaker, RegionMarker, TemplateCategory } from './types';
import { SPEAKER_PRESETS } from './speakerPresets';

const STORAGE_KEY = 'audio_array_templates';

export class TemplateLibrary {
    private templates: Map<string, LayoutTemplate> = new Map();
    private eventListeners: Map<string, Function[]> = new Map();

    constructor() {
        this.loadBuiltInTemplates();
        this.loadCustomTemplates();
    }

    private loadBuiltInTemplates(): void {
        const builtInTemplates: LayoutTemplate[] = [
            {
                id: 'built-in-concert-001',
                name: '大型演唱会阵列',
                description: '适用于大型演唱会的左右线阵列配置，包含低音阵列和补声',
                category: 'concert',
                isBuiltIn: true,
                createdAt: new Date().toISOString(),
                speakers: [
                    { type: 'line-array', name: '左线阵列 L1', x: 200, y: 150, rotation: 15, volume: 100, delay: 0, frequencyRange: { min: 80, max: 18000 }, power: 1000, directivity: 60 },
                    { type: 'line-array', name: '左线阵列 L2', x: 200, y: 200, rotation: 15, volume: 100, delay: 0, frequencyRange: { min: 80, max: 18000 }, power: 1000, directivity: 60 },
                    { type: 'line-array', name: '左线阵列 L3', x: 200, y: 250, rotation: 15, volume: 100, delay: 0, frequencyRange: { min: 80, max: 18000 }, power: 1000, directivity: 60 },
                    { type: 'line-array', name: '右线阵列 R1', x: 800, y: 150, rotation: -15, volume: 100, delay: 0, frequencyRange: { min: 80, max: 18000 }, power: 1000, directivity: 60 },
                    { type: 'line-array', name: '右线阵列 R2', x: 800, y: 200, rotation: -15, volume: 100, delay: 0, frequencyRange: { min: 80, max: 18000 }, power: 1000, directivity: 60 },
                    { type: 'line-array', name: '右线阵列 R3', x: 800, y: 250, rotation: -15, volume: 100, delay: 0, frequencyRange: { min: 80, max: 18000 }, power: 1000, directivity: 60 },
                    { type: 'subwoofer', name: '低音阵列 SUB1', x: 350, y: 100, rotation: 0, volume: 90, delay: 0, frequencyRange: { min: 20, max: 250 }, power: 1500, directivity: 180 },
                    { type: 'subwoofer', name: '低音阵列 SUB2', x: 500, y: 100, rotation: 0, volume: 90, delay: 0, frequencyRange: { min: 20, max: 250 }, power: 1500, directivity: 180 },
                    { type: 'subwoofer', name: '低音阵列 SUB3', x: 650, y: 100, rotation: 0, volume: 90, delay: 0, frequencyRange: { min: 20, max: 250 }, power: 1500, directivity: 180 },
                    { type: 'fill', name: '台唇补声 F1', x: 400, y: 120, rotation: 0, volume: 75, delay: 10, frequencyRange: { min: 100, max: 15000 }, power: 200, directivity: 120 },
                    { type: 'fill', name: '台唇补声 F2', x: 600, y: 120, rotation: 0, volume: 75, delay: 10, frequencyRange: { min: 100, max: 15000 }, power: 200, directivity: 120 }
                ],
                regions: [
                    { name: '主舞台', type: 'stage', x: 300, y: 50, width: 400, height: 100, color: 'rgba(0, 212, 255, 0.3)', priority: 1, visible: true, targetSpl: 95 },
                    { name: '观众区', type: 'audience', x: 100, y: 200, width: 800, height: 400, color: 'rgba(16, 185, 129, 0.2)', priority: 2, visible: true, targetSpl: 90 }
                ]
            },
            {
                id: 'built-in-theater-001',
                name: '经典剧场配置',
                description: '传统镜框式舞台剧场音响配置，适用于话剧、音乐剧',
                category: 'theater',
                isBuiltIn: true,
                createdAt: new Date().toISOString(),
                speakers: [
                    { type: 'line-array', name: '左主扩 L', x: 200, y: 180, rotation: 20, volume: 100, delay: 0, frequencyRange: { min: 80, max: 18000 }, power: 800, directivity: 60 },
                    { type: 'line-array', name: '右主扩 R', x: 800, y: 180, rotation: -20, volume: 100, delay: 0, frequencyRange: { min: 80, max: 18000 }, power: 800, directivity: 60 },
                    { type: 'point-source', name: '中置声道 C', x: 500, y: 150, rotation: 0, volume: 95, delay: 0, frequencyRange: { min: 60, max: 16000 }, power: 500, directivity: 90 },
                    { type: 'fill', name: '乐池补声 L1', x: 350, y: 200, rotation: 10, volume: 70, delay: 15, frequencyRange: { min: 100, max: 15000 }, power: 150, directivity: 120 },
                    { type: 'fill', name: '乐池补声 L2', x: 450, y: 200, rotation: 5, volume: 70, delay: 15, frequencyRange: { min: 100, max: 15000 }, power: 150, directivity: 120 },
                    { type: 'fill', name: '乐池补声 R1', x: 550, y: 200, rotation: -5, volume: 70, delay: 15, frequencyRange: { min: 100, max: 15000 }, power: 150, directivity: 120 },
                    { type: 'fill', name: '乐池补声 R2', x: 650, y: 200, rotation: -10, volume: 70, delay: 15, frequencyRange: { min: 100, max: 15000 }, power: 150, directivity: 120 },
                    { type: 'fill', name: '左环绕 LS', x: 150, y: 350, rotation: 90, volume: 60, delay: 30, frequencyRange: { min: 100, max: 15000 }, power: 100, directivity: 120 },
                    { type: 'fill', name: '右环绕 RS', x: 850, y: 350, rotation: -90, volume: 60, delay: 30, frequencyRange: { min: 100, max: 15000 }, power: 100, directivity: 120 }
                ],
                regions: [
                    { name: '镜框舞台', type: 'stage', x: 350, y: 60, width: 300, height: 120, color: 'rgba(0, 212, 255, 0.3)', priority: 1, visible: true, targetSpl: 92 },
                    { name: '观众池座', type: 'audience', x: 150, y: 220, width: 700, height: 250, color: 'rgba(16, 185, 129, 0.2)', priority: 2, visible: true, targetSpl: 88 },
                    { name: 'VIP包厢', type: 'vip', x: 100, y: 250, width: 80, height: 100, color: 'rgba(245, 158, 11, 0.3)', priority: 3, visible: true, targetSpl: 90 },
                    { name: 'VIP包厢', type: 'vip', x: 820, y: 250, width: 80, height: 100, color: 'rgba(245, 158, 11, 0.3)', priority: 3, visible: true, targetSpl: 90 }
                ]
            },
            {
                id: 'built-in-conference-001',
                name: '会议厅配置',
                description: '中小型会议厅音响配置，注重语音清晰度',
                category: 'conference',
                isBuiltIn: true,
                createdAt: new Date().toISOString(),
                speakers: [
                    { type: 'point-source', name: '主扩 L', x: 250, y: 150, rotation: 15, volume: 85, delay: 0, frequencyRange: { min: 80, max: 16000 }, power: 300, directivity: 90 },
                    { type: 'point-source', name: '主扩 R', x: 750, y: 150, rotation: -15, volume: 85, delay: 0, frequencyRange: { min: 80, max: 16000 }, power: 300, directivity: 90 },
                    { type: 'point-source', name: '中央补声', x: 500, y: 150, rotation: 0, volume: 75, delay: 0, frequencyRange: { min: 80, max: 16000 }, power: 200, directivity: 90 },
                    { type: 'fill', name: '桌面补声 1', x: 350, y: 250, rotation: 0, volume: 60, delay: 20, frequencyRange: { min: 200, max: 12000 }, power: 50, directivity: 120 },
                    { type: 'fill', name: '桌面补声 2', x: 500, y: 250, rotation: 0, volume: 60, delay: 20, frequencyRange: { min: 200, max: 12000 }, power: 50, directivity: 120 },
                    { type: 'fill', name: '桌面补声 3', x: 650, y: 250, rotation: 0, volume: 60, delay: 20, frequencyRange: { min: 200, max: 12000 }, power: 50, directivity: 120 }
                ],
                regions: [
                    { name: '主席台', type: 'stage', x: 350, y: 50, width: 300, height: 100, color: 'rgba(0, 212, 255, 0.3)', priority: 1, visible: true, targetSpl: 88 },
                    { name: '听众区', type: 'audience', x: 200, y: 180, width: 600, height: 300, color: 'rgba(16, 185, 129, 0.2)', priority: 2, visible: true, targetSpl: 85 }
                ]
            },
            {
                id: 'built-in-wedding-001',
                name: '婚礼宴会厅配置',
                description: '温馨浪漫的婚礼宴会厅音响配置',
                category: 'wedding',
                isBuiltIn: true,
                createdAt: new Date().toISOString(),
                speakers: [
                    { type: 'line-array', name: '主扩左 L', x: 200, y: 120, rotation: 15, volume: 90, delay: 0, frequencyRange: { min: 60, max: 18000 }, power: 600, directivity: 60 },
                    { type: 'line-array', name: '主扩右 R', x: 800, y: 120, rotation: -15, volume: 90, delay: 0, frequencyRange: { min: 60, max: 18000 }, power: 600, directivity: 60 },
                    { type: 'subwoofer', name: '低音炮 1', x: 350, y: 100, rotation: 0, volume: 80, delay: 0, frequencyRange: { min: 20, max: 200 }, power: 1000, directivity: 180 },
                    { type: 'subwoofer', name: '低音炮 2', x: 650, y: 100, rotation: 0, volume: 80, delay: 0, frequencyRange: { min: 20, max: 200 }, power: 1000, directivity: 180 },
                    { type: 'fill', name: '补声 1', x: 300, y: 300, rotation: 10, volume: 65, delay: 25, frequencyRange: { min: 100, max: 15000 }, power: 100, directivity: 120 },
                    { type: 'fill', name: '补声 2', x: 500, y: 300, rotation: 0, volume: 65, delay: 25, frequencyRange: { min: 100, max: 15000 }, power: 100, directivity: 120 },
                    { type: 'fill', name: '补声 3', x: 700, y: 300, rotation: -10, volume: 65, delay: 25, frequencyRange: { min: 100, max: 15000 }, power: 100, directivity: 120 },
                    { type: 'fill', name: '补声 4', x: 200, y: 450, rotation: 20, volume: 60, delay: 40, frequencyRange: { min: 100, max: 15000 }, power: 80, directivity: 120 },
                    { type: 'fill', name: '补声 5', x: 800, y: 450, rotation: -20, volume: 60, delay: 40, frequencyRange: { min: 100, max: 15000 }, power: 80, directivity: 120 }
                ],
                regions: [
                    { name: '仪式台', type: 'stage', x: 380, y: 50, width: 240, height: 80, color: 'rgba(236, 72, 153, 0.3)', priority: 1, visible: true, targetSpl: 90 },
                    { name: '宴席区', type: 'audience', x: 100, y: 180, width: 800, height: 400, color: 'rgba(251, 191, 36, 0.15)', priority: 2, visible: true, targetSpl: 85 }
                ]
            }
        ];

        builtInTemplates.forEach(t => this.templates.set(t.id, t));
    }

    private loadCustomTemplates(): void {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const customTemplates: LayoutTemplate[] = JSON.parse(stored);
                customTemplates.forEach(t => this.templates.set(t.id, t));
            }
        } catch (e) {
            console.error('Failed to load custom templates:', e);
        }
    }

    private saveCustomTemplates(): void {
        try {
            const customTemplates = Array.from(this.templates.values()).filter(t => !t.isBuiltIn);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(customTemplates));
        } catch (e) {
            console.error('Failed to save custom templates:', e);
        }
    }

    getAllTemplates(): LayoutTemplate[] {
        return Array.from(this.templates.values()).sort((a, b) => {
            if (a.isBuiltIn !== b.isBuiltIn) return a.isBuiltIn ? -1 : 1;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
    }

    getTemplatesByCategory(category: TemplateCategory): LayoutTemplate[] {
        return this.getAllTemplates().filter(t => t.category === category);
    }

    getTemplate(id: string): LayoutTemplate | undefined {
        return this.templates.get(id);
    }

    createTemplate(
        name: string,
        description: string,
        category: TemplateCategory,
        speakers: Speaker[],
        regions: RegionMarker[]
    ): LayoutTemplate {
        const template: LayoutTemplate = {
            id: `template-${Date.now()}`,
            name,
            description,
            category,
            speakers: speakers.map(s => ({
                type: s.type,
                name: s.name,
                x: s.x,
                y: s.y,
                rotation: s.rotation,
                volume: s.volume,
                delay: s.delay,
                frequencyRange: { ...s.frequencyRange },
                power: s.power,
                directivity: s.directivity
            })),
            regions: regions.map(r => ({
                name: r.name,
                type: r.type,
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height,
                color: r.color,
                priority: r.priority,
                visible: r.visible,
                description: r.description,
                targetSpl: r.targetSpl
            })),
            createdAt: new Date().toISOString(),
            isBuiltIn: false
        };

        this.templates.set(template.id, template);
        this.saveCustomTemplates();
        this.emit('template-added', template);
        
        return template;
    }

    deleteTemplate(id: string): boolean {
        const template = this.templates.get(id);
        if (!template || template.isBuiltIn) return false;
        
        const deleted = this.templates.delete(id);
        if (deleted) {
            this.saveCustomTemplates();
            this.emit('template-deleted', id);
        }
        return deleted;
    }

    applyTemplate(templateId: string, canvasWidth: number, canvasHeight: number): { speakers: Speaker[]; regions: RegionMarker[] } {
        const template = this.templates.get(templateId);
        if (!template) {
            return { speakers: [], regions: [] };
        }

        const scaleX = canvasWidth / 1000;
        const scaleY = canvasHeight / 600;
        const scale = Math.min(scaleX, scaleY);
        const offsetX = (canvasWidth - 1000 * scale) / 2;
        const offsetY = (canvasHeight - 600 * scale) / 2;

        const speakers: Speaker[] = template.speakers.map(s => ({
            ...s,
            id: `speaker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            x: s.x * scale + offsetX,
            y: s.y * scale + offsetY
        }));

        const regions: RegionMarker[] = (template.regions || []).map(r => ({
            ...r,
            id: `region-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            x: r.x * scale + offsetX,
            y: r.y * scale + offsetY,
            width: r.width * scale,
            height: r.height * scale
        }));

        return { speakers, regions };
    }

    on(event: string, callback: Function): void {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event)!.push(callback);
    }

    off(event: string, callback: Function): void {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    private emit(event: string, data: any): void {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.forEach(callback => callback(data));
        }
    }
}

export const templateLibrary = new TemplateLibrary();
