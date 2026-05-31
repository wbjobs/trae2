import { Speaker, AcousticParams, SoundFieldResult, AudioClip, RegionMarker, RegionType, LayoutTemplate, TemplateCategory } from './types';
import { SPEAKER_PRESETS } from './speakerPresets';
import { TimelineController } from './timelineController';
import { simulatorClient } from './simulatorClient';
import { templateLibrary } from './templateLibrary';
import { regionManager } from './regionManager';

const { ipcRenderer } = require('electron');

export interface UIEvents {
    onNewProject: () => void;
    onOpenProject: () => void;
    onSaveProject: (saveAs: boolean) => void;
    onCalculateSoundField: (force: boolean) => void;
    onStartSimulation: () => void;
    onAddSpeaker: (type: any) => void;
    onSpeakerPropertyChange: (speakerId: string, property: string, value: any) => void;
    onParamChange: (param: keyof AcousticParams, value: number) => void;
    onShowOptionChange: (option: string, value: any) => void;
    onToggleSimulator: () => void;
    onSendToSimulator: () => void;
    onTimelineSeek: (time: number) => void;
    onApplyTemplate: (templateId: string) => void;
    onCreateTemplate: (name: string, description: string, category: TemplateCategory) => void;
    onAddRegion: (type: RegionType) => void;
    onDeleteRegion: (regionId: string) => void;
    onRegionPropertyChange: (regionId: string, property: string, value: any) => void;
}

export class UIManager {
    private eventHandlers: Partial<UIEvents> = {};
    private timeline: TimelineController;

    constructor(timeline: TimelineController) {
        this.timeline = timeline;
    }

    setHandler<K extends keyof UIEvents>(event: K, handler: UIEvents[K]): void {
        this.eventHandlers[event] = handler;
    }

    init(): void {
        this.initToolbar();
        this.initSpeakerLibrary();
        this.initParamControls();
        this.initShowOptions();
        this.initSimulatorControls();
        this.initTimeline();
        this.initTemplateLibrary();
        this.initRegionControls();
    }

    private initToolbar(): void {
        document.getElementById('btn-new')!.addEventListener('click', () => {
            this.eventHandlers.onNewProject?.();
        });
        document.getElementById('btn-open')!.addEventListener('click', () => {
            this.eventHandlers.onOpenProject?.();
        });
        document.getElementById('btn-save')!.addEventListener('click', () => {
            this.eventHandlers.onSaveProject?.(false);
        });
        document.getElementById('btn-save-as')!.addEventListener('click', () => {
            this.eventHandlers.onSaveProject?.(true);
        });
        document.getElementById('btn-calculate')!.addEventListener('click', () => {
            this.eventHandlers.onCalculateSoundField?.(false);
        });
        document.getElementById('btn-simulate')!.addEventListener('click', () => {
            this.eventHandlers.onStartSimulation?.();
        });
    }

    private initSpeakerLibrary(): void {
        document.querySelectorAll('.speaker-item').forEach(item => {
            item.addEventListener('click', () => {
                const type = (item as HTMLElement).dataset.type;
                this.eventHandlers.onAddSpeaker?.(type);
            });
        });
    }

    private initParamControls(): void {
        document.getElementById('param-frequency')!.addEventListener('change', (e) => {
            this.eventHandlers.onParamChange?.('frequency', parseInt((e.target as HTMLInputElement).value));
        });
        document.getElementById('param-temperature')!.addEventListener('change', (e) => {
            this.eventHandlers.onParamChange?.('temperature', parseInt((e.target as HTMLInputElement).value));
        });
        document.getElementById('param-humidity')!.addEventListener('change', (e) => {
            this.eventHandlers.onParamChange?.('humidity', parseInt((e.target as HTMLInputElement).value));
        });
    }

    private initShowOptions(): void {
        document.getElementById('show-heatmap')!.addEventListener('change', (e) => {
            this.eventHandlers.onShowOptionChange?.('heatmap', (e.target as HTMLInputElement).checked);
        });
        document.getElementById('show-grid')!.addEventListener('change', (e) => {
            this.eventHandlers.onShowOptionChange?.('grid', (e.target as HTMLInputElement).checked);
        });
        document.getElementById('show-labels')!.addEventListener('change', (e) => {
            this.eventHandlers.onShowOptionChange?.('labels', (e.target as HTMLInputElement).checked);
        });
        document.getElementById('heatmap-opacity')!.addEventListener('input', (e) => {
            this.eventHandlers.onShowOptionChange?.('heatmapOpacity', parseInt((e.target as HTMLInputElement).value) / 100);
        });
    }

    private initSimulatorControls(): void {
        document.getElementById('btn-connect-sim')!.addEventListener('click', () => {
            this.eventHandlers.onToggleSimulator?.();
        });
        document.getElementById('btn-send-to-sim')!.addEventListener('click', () => {
            this.eventHandlers.onSendToSimulator?.();
        });
    }

    private initTimeline(): void {
        document.getElementById('btn-play')!.addEventListener('click', () => this.timeline.play());
        document.getElementById('btn-pause')!.addEventListener('click', () => this.timeline.pause());
        document.getElementById('btn-stop')!.addEventListener('click', () => this.timeline.stop());

        this.timeline.on('time-update', (time: number) => {
            document.getElementById('current-time')!.textContent = TimelineController.formatTime(time);
            const cursor = document.getElementById('timeline-cursor')!;
            const percent = (time / this.timeline.getTotalDuration()) * 100;
            cursor.style.left = `${percent}%`;
        });

        this.timeline.on('duration-changed', (duration: number) => {
            document.getElementById('total-time')!.textContent = TimelineController.formatTime(duration);
        });

        document.getElementById('timeline-track')!.addEventListener('click', (e) => {
            const rect = (e.target as HTMLElement).getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percent = x / rect.width;
            const time = percent * this.timeline.getTotalDuration();
            this.eventHandlers.onTimelineSeek?.(time);
        });
    }

    private initTemplateLibrary(): void {
        const templates = templateLibrary.getAllTemplates();
        this.renderTemplateList(templates);
    }

    renderTemplateList(templates: LayoutTemplate[]): void {
        const container = document.getElementById('template-list');
        if (!container) return;

        container.innerHTML = templates.map(t => `
            <div class="template-item" data-id="${t.id}" title="${t.description}">
                <div class="template-icon">📋</div>
                <div class="template-info">
                    <div class="template-name">${t.name}</div>
                    <div class="template-desc">${t.speakers.length} 个音响 | ${t.category}</div>
                </div>
                ${!t.isBuiltIn ? '<button class="template-delete" data-id="' + t.id + '">×</button>' : ''}
            </div>
        `).join('');

        container.querySelectorAll('.template-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if ((e.target as HTMLElement).classList.contains('template-delete')) return;
                const id = (item as HTMLElement).dataset.id;
                if (id) this.eventHandlers.onApplyTemplate?.(id);
            });
        });

        container.querySelectorAll('.template-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = (btn as HTMLElement).dataset.id;
                if (id) templateLibrary.deleteTemplate(id);
                this.renderTemplateList(templateLibrary.getAllTemplates());
            });
        });

        document.getElementById('btn-create-template')?.addEventListener('click', () => {
            const name = prompt('输入模板名称:') || '自定义模板';
            const description = prompt('输入模板描述:') || '';
            const category = (prompt('输入分类 (concert/theater/conference/wedding/custom):') || 'custom') as TemplateCategory;
            this.eventHandlers.onCreateTemplate?.(name, description, category);
        });
    }

    private initRegionControls(): void {
        const regionButtons = document.querySelectorAll('.region-type-btn');
        regionButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const type = (btn as HTMLElement).dataset.type as RegionType;
                this.eventHandlers.onAddRegion?.(type);
            });
        });
    }

    updateSpeakerProperties(speaker: Speaker | null): void {
        const panel = document.getElementById('speaker-properties')!;

        if (!speaker) {
            panel.innerHTML = '<p class="no-selection">请选择一个音响查看属性</p>';
            return;
        }

        const preset = SPEAKER_PRESETS[speaker.type];

        panel.innerHTML = `
            <div class="prop-group">
                <label>名称</label>
                <input type="text" id="prop-name" value="${speaker.name}">
            </div>
            <div class="prop-group">
                <label>类型</label>
                <input type="text" value="${preset.icon} ${preset.name}" disabled>
            </div>
            <div class="prop-group">
                <label>X 位置</label>
                <input type="number" id="prop-x" value="${Math.round(speaker.x)}">
            </div>
            <div class="prop-group">
                <label>Y 位置</label>
                <input type="number" id="prop-y" value="${Math.round(speaker.y)}">
            </div>
            <div class="prop-group">
                <label>旋转角度 (°)</label>
                <input type="number" id="prop-rotation" value="${speaker.rotation}" min="0" max="359">
            </div>
            <div class="prop-group">
                <label>音量 (%)</label>
                <input type="range" id="prop-volume" value="${speaker.volume}" min="0" max="100">
                <span>${speaker.volume}%</span>
            </div>
            <div class="prop-group">
                <label>延时 (ms)</label>
                <input type="number" id="prop-delay" value="${speaker.delay}" min="0" max="1000">
            </div>
            <div class="prop-group">
                <label>功率 (W)</label>
                <input type="number" id="prop-power" value="${speaker.power}" min="1">
            </div>
            <div class="prop-group">
                <label>指向角度 (°)</label>
                <input type="number" id="prop-directivity" value="${speaker.directivity}" min="10" max="360">
            </div>
        `;

        const bindPropChange = (id: string, property: string, parser: (v: string) => any) => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', (e) => {
                    const value = parser((e.target as HTMLInputElement).value);
                    this.eventHandlers.onSpeakerPropertyChange?.(speaker.id, property, value);
                });
            }
        };

        bindPropChange('prop-name', 'name', v => v);
        bindPropChange('prop-x', 'x', v => parseInt(v));
        bindPropChange('prop-y', 'y', v => parseInt(v));
        bindPropChange('prop-rotation', 'rotation', v => parseInt(v));
        bindPropChange('prop-delay', 'delay', v => parseInt(v));
        bindPropChange('prop-power', 'power', v => parseInt(v));
        bindPropChange('prop-directivity', 'directivity', v => parseInt(v));

        const volumeEl = document.getElementById('prop-volume');
        if (volumeEl) {
            volumeEl.addEventListener('input', (e) => {
                const value = parseInt((e.target as HTMLInputElement).value);
                (e.target as HTMLElement).nextElementSibling!.textContent = value + '%';
                this.eventHandlers.onSpeakerPropertyChange?.(speaker.id, 'volume', value);
            });
        }
    }

    updateRegionProperties(region: RegionMarker | null): void {
        const panel = document.getElementById('region-properties');
        if (!panel) return;

        if (!region) {
            panel.innerHTML = '<p class="no-selection">请选择一个区域查看属性</p>';
            return;
        }

        panel.innerHTML = `
            <div class="prop-group">
                <label>名称</label>
                <input type="text" id="region-prop-name" value="${region.name}">
            </div>
            <div class="prop-group">
                <label>类型</label>
                <input type="text" value="${region.type}" disabled>
            </div>
            <div class="prop-group">
                <label>X 位置</label>
                <input type="number" id="region-prop-x" value="${Math.round(region.x)}">
            </div>
            <div class="prop-group">
                <label>Y 位置</label>
                <input type="number" id="region-prop-y" value="${Math.round(region.y)}">
            </div>
            <div class="prop-group">
                <label>宽度</label>
                <input type="number" id="region-prop-width" value="${Math.round(region.width)}" min="10">
            </div>
            <div class="prop-group">
                <label>高度</label>
                <input type="number" id="region-prop-height" value="${Math.round(region.height)}" min="10">
            </div>
            <div class="prop-group">
                <label>目标声压级 (dB)</label>
                <input type="number" id="region-prop-targetspl" value="${region.targetSpl || 90}" min="60" max="120">
            </div>
            <div class="prop-group">
                <label><input type="checkbox" id="region-prop-visible" ${region.visible ? 'checked' : ''}> 可见</label>
            </div>
            <button id="btn-delete-region" class="toolbar-btn danger" style="width: 100%; margin-top: 8px;">删除区域</button>
        `;

        const bindChange = (id: string, property: string, parser: (v: string) => any) => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', (e) => {
                    const value = parser((e.target as HTMLInputElement).value);
                    this.eventHandlers.onRegionPropertyChange?.(region.id, property, value);
                });
            }
        };

        bindChange('region-prop-name', 'name', v => v);
        bindChange('region-prop-x', 'x', v => parseInt(v));
        bindChange('region-prop-y', 'y', v => parseInt(v));
        bindChange('region-prop-width', 'width', v => parseInt(v));
        bindChange('region-prop-height', 'height', v => parseInt(v));
        bindChange('region-prop-targetspl', 'targetSpl', v => parseInt(v));

        const visibleEl = document.getElementById('region-prop-visible') as HTMLInputElement;
        if (visibleEl) {
            visibleEl.addEventListener('change', (e) => {
                this.eventHandlers.onRegionPropertyChange?.(region.id, 'visible', (e.target as HTMLInputElement).checked);
            });
        }

        document.getElementById('btn-delete-region')?.addEventListener('click', () => {
            this.eventHandlers.onDeleteRegion?.(region.id);
        });
    }

    updateAnalysisResults(result: SoundFieldResult | null): void {
        if (!result) {
            document.getElementById('result-max-spl')!.textContent = '-- dB';
            document.getElementById('result-min-spl')!.textContent = '-- dB';
            document.getElementById('result-uniformity')!.textContent = '-- dB';
            document.getElementById('result-coverage')!.textContent = '-- %';
            return;
        }

        document.getElementById('result-max-spl')!.textContent = `${result.maxSpl.toFixed(1)} dB`;
        document.getElementById('result-min-spl')!.textContent = `${result.minSpl.toFixed(1)} dB`;
        document.getElementById('result-uniformity')!.textContent = `${result.uniformity.toFixed(1)} dB`;
        document.getElementById('result-coverage')!.textContent = `${result.coverage.toFixed(1)} %`;
    }

    updateSimulatorStatus(connected: boolean): void {
        const indicator = document.getElementById('simulator-status')!;
        const text = document.getElementById('simulator-status-text')!;
        const btn = document.getElementById('btn-connect-sim')!;

        if (connected) {
            indicator.className = 'status-indicator connected';
            text.textContent = '已连接';
            btn.textContent = '断开连接';
            (document.getElementById('btn-send-to-sim') as HTMLButtonElement).disabled = false;
        } else {
            indicator.className = 'status-indicator disconnected';
            text.textContent = '未连接';
            btn.textContent = '连接模拟器';
            (document.getElementById('btn-send-to-sim') as HTMLButtonElement).disabled = true;
        }
    }

    updateSpeakerCount(count: number): void {
        document.getElementById('speaker-count')!.textContent = count.toString();
    }

    updateProjectName(name: string): void {
        document.getElementById('project-name')!.textContent = name;
    }

    updateParamValues(params: AcousticParams): void {
        (document.getElementById('param-frequency') as HTMLInputElement).value = params.frequency.toString();
        (document.getElementById('param-temperature') as HTMLInputElement).value = params.temperature.toString();
        (document.getElementById('param-humidity') as HTMLInputElement).value = params.humidity.toString();
    }

    setStatus(text: string): void {
        document.getElementById('status-text')!.textContent = text;
    }

    renderClip(clip: AudioClip, totalDuration: number): void {
        const clipsContainer = document.getElementById('audio-clips')!;
        const clipEl = document.createElement('div');
        clipEl.className = 'audio-clip';
        clipEl.dataset.id = clip.id;
        
        clipEl.style.left = `${(clip.startTime / totalDuration) * 100}%`;
        clipEl.style.width = `${(clip.duration / totalDuration) * 100}%`;
        clipEl.textContent = clip.name;
        
        clipsContainer.appendChild(clipEl);
    }

    clearClips(): void {
        document.getElementById('audio-clips')!.innerHTML = '';
    }
}
