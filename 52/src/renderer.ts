import { Speaker, SpeakerType, AcousticParams, SoundFieldResult, AudioClip, Project, RegionMarker, RegionType, TemplateCategory } from './types';
import { SPEAKER_PRESETS } from './speakerPresets';
import { AcousticCalculator } from './acousticCalculator';
import { simulatorClient } from './simulatorClient';
import { TimelineController } from './timelineController';
import { CanvasRenderer } from './canvasRenderer';
import { UIManager } from './uiManager';
import { templateLibrary } from './templateLibrary';
import { regionManager } from './regionManager';

const { ipcRenderer } = require('electron');

class App {
    private speakers: Speaker[] = [];
    private selectedSpeakerId: string | null = null;
    private acousticParams: AcousticParams;
    private soundFieldResult: SoundFieldResult | null = null;
    private timeline: TimelineController;
    private canvasRenderer: CanvasRenderer;
    private uiManager: UIManager;
    private audioContext: AudioContext | null = null;
    private projectName: string = '未命名工程';
    private currentFilePath: string | null = null;
    private isDragging: boolean = false;
    private dragOffset: { x: number; y: number } = { x: 0, y: 0 };
    private selectionMode: 'speaker' | 'region' = 'speaker';

    constructor() {
        this.acousticParams = {
            frequency: 1000,
            temperature: 20,
            humidity: 50
        };

        const canvas = document.getElementById('layout-canvas') as HTMLCanvasElement;
        this.canvasRenderer = new CanvasRenderer(canvas);
        this.timeline = new TimelineController();
        this.uiManager = new UIManager(this.timeline);

        this.init();
    }

    private init(): void {
        this.initCanvas();
        this.initUIHandlers();
        this.initMouseEventListeners();
        this.initKeyboardListeners();
        this.initTimelineHandler();
        this.initTemplateListeners();
        this.initRegionListeners();

        this.uiManager.init();
        this.addDemoClips();
        this.render();
    }

    private initCanvas(): void {
        const resize = () => {
            this.canvasRenderer.resize();
            this.render();
        };

        window.addEventListener('resize', resize);
        setTimeout(resize, 100);
    }

    private initUIHandlers(): void {
        this.uiManager.setHandler('onNewProject', () => this.newProject());
        this.uiManager.setHandler('onOpenProject', () => this.openProject());
        this.uiManager.setHandler('onSaveProject', (saveAs) => this.saveProject(saveAs));
        this.uiManager.setHandler('onCalculateSoundField', (force) => this.calculateSoundField(force));
        this.uiManager.setHandler('onStartSimulation', () => this.startSimulation());
        this.uiManager.setHandler('onAddSpeaker', (type) => this.addSpeaker(type));
        this.uiManager.setHandler('onSpeakerPropertyChange', (id, prop, val) => this.updateSpeakerProperty(id, prop, val));
        this.uiManager.setHandler('onParamChange', (param, value) => this.updateAcousticParam(param, value));
        this.uiManager.setHandler('onShowOptionChange', (option, value) => this.updateShowOption(option, value));
        this.uiManager.setHandler('onToggleSimulator', () => this.toggleSimulatorConnection());
        this.uiManager.setHandler('onSendToSimulator', () => this.sendToSimulator());
        this.uiManager.setHandler('onTimelineSeek', (time) => this.timeline.seek(time));
        this.uiManager.setHandler('onApplyTemplate', (templateId) => this.applyTemplate(templateId));
        this.uiManager.setHandler('onCreateTemplate', (name, desc, cat) => this.createTemplate(name, desc, cat));
        this.uiManager.setHandler('onAddRegion', (type) => this.addRegion(type));
        this.uiManager.setHandler('onDeleteRegion', (id) => this.deleteRegion(id));
        this.uiManager.setHandler('onRegionPropertyChange', (id, prop, val) => this.updateRegionProperty(id, prop, val));
    }

    private initMouseEventListeners(): void {
        const canvas = this.canvasRenderer.getCanvas();
        
        canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        canvas.addEventListener('mouseup', () => this.onMouseUp());
        canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
    }

    private initKeyboardListeners(): void {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Delete') {
                if (this.selectedSpeakerId) {
                    this.removeSpeaker(this.selectedSpeakerId);
                } else {
                    const selectedRegion = regionManager.getSelectedRegion();
                    if (selectedRegion) {
                        this.deleteRegion(selectedRegion.id);
                    }
                }
            }
            if (e.key === 'Escape') {
                this.selectedSpeakerId = null;
                regionManager.setSelectedRegion(null);
                this.updateSelectionUI();
                this.render();
            }
        });
    }

    private initTimelineHandler(): void {
        this.timeline.setOnClipTrigger((clip: AudioClip) => {
            this.playAudioClip(clip);
        });
    }

    private initTemplateListeners(): void {
        templateLibrary.on('template-added', () => {
            this.uiManager.renderTemplateList(templateLibrary.getAllTemplates());
        });
        templateLibrary.on('template-deleted', () => {
            this.uiManager.renderTemplateList(templateLibrary.getAllTemplates());
        });
    }

    private initRegionListeners(): void {
        regionManager.on('region-added', () => this.render());
        regionManager.on('region-updated', () => this.render());
        regionManager.on('region-deleted', () => this.render());
        regionManager.on('regions-reset', () => this.render());
        regionManager.on('selection-changed', () => {
            const selected = regionManager.getSelectedRegion();
            if (selected) {
                this.selectedSpeakerId = null;
                this.selectionMode = 'region';
                this.uiManager.updateRegionProperties(selected);
            }
            this.render();
        });
    }

    private addDemoClips(): void {
        const clips: AudioClip[] = [
            { id: '1', name: '开场音效', startTime: 0, duration: 2000, speakerId: 'all', volume: 80 },
            { id: '2', name: '背景音乐', startTime: 1000, duration: 5000, speakerId: 'all', volume: 60 },
            { id: '3', name: '高潮效果', startTime: 6000, duration: 3000, speakerId: 'all', volume: 90 }
        ];
        
        clips.forEach(clip => {
            this.timeline.addClip(clip);
            this.uiManager.renderClip(clip, this.timeline.getTotalDuration());
        });
    }

    private addSpeaker(type: SpeakerType): void {
        const preset = SPEAKER_PRESETS[type];
        const canvas = this.canvasRenderer.getCanvas();
        const id = `speaker-${Date.now()}`;
        
        const speaker: Speaker = {
            id,
            type,
            name: `${preset.name} ${this.speakers.length + 1}`,
            x: canvas.width / 2 + (Math.random() - 0.5) * 200,
            y: canvas.height / 2 + (Math.random() - 0.5) * 200,
            rotation: 0,
            volume: 100,
            delay: 0,
            frequencyRange: { ...preset.frequencyRange },
            power: preset.defaultPower,
            directivity: preset.defaultDirectivity
        };

        this.speakers.push(speaker);
        this.selectedSpeakerId = id;
        regionManager.setSelectedRegion(null);
        this.selectionMode = 'speaker';
        this.updateSpeakerCount();
        this.updateSelectionUI();
        this.render();
        this.uiManager.setStatus(`已添加 ${preset.name}`);
    }

    private removeSpeaker(id: string): void {
        this.speakers = this.speakers.filter(s => s.id !== id);
        if (this.selectedSpeakerId === id) {
            this.selectedSpeakerId = null;
        }
        this.updateSpeakerCount();
        this.updateSelectionUI();
        this.render();
        this.uiManager.setStatus('已删除音响');
    }

    private updateSpeakerProperty(id: string, property: string, value: any): void {
        const speaker = this.speakers.find(s => s.id === id);
        if (!speaker) return;

        (speaker as any)[property] = value;
        this.render();
    }

    private updateAcousticParam(param: keyof AcousticParams, value: number): void {
        this.acousticParams[param] = value;
    }

    private updateShowOption(option: string, value: any): void {
        const options: any = {};
        if (option === 'heatmap') options.showHeatmap = value;
        if (option === 'grid') options.showGrid = value;
        if (option === 'labels') options.showLabels = value;
        if (option === 'heatmapOpacity') options.heatmapOpacity = value;
        
        this.canvasRenderer.setOptions(options);
        this.render();
    }

    private onMouseDown(e: MouseEvent): void {
        const canvas = this.canvasRenderer.getCanvas();
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const clickedSpeaker = this.speakers.find(s => {
            const dx = s.x - x;
            const dy = s.y - y;
            return Math.sqrt(dx * dx + dy * dy) < 25;
        });

        if (clickedSpeaker) {
            this.selectedSpeakerId = clickedSpeaker.id;
            regionManager.setSelectedRegion(null);
            this.selectionMode = 'speaker';
            this.isDragging = true;
            this.dragOffset = { x: x - clickedSpeaker.x, y: y - clickedSpeaker.y };
            this.updateSelectionUI();
        } else {
            const clickedRegion = regionManager.getRegionAtPoint(x, y);
            if (clickedRegion) {
                regionManager.setSelectedRegion(clickedRegion.id);
                this.selectedSpeakerId = null;
                this.selectionMode = 'region';
                this.updateSelectionUI();
            } else {
                this.selectedSpeakerId = null;
                regionManager.setSelectedRegion(null);
                this.updateSelectionUI();
            }
        }
        this.render();
    }

    private onMouseMove(e: MouseEvent): void {
        if (!this.isDragging || !this.selectedSpeakerId) return;

        const canvas = this.canvasRenderer.getCanvas();
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - this.dragOffset.x;
        const y = e.clientY - rect.top - this.dragOffset.y;

        const speaker = this.speakers.find(s => s.id === this.selectedSpeakerId);
        if (speaker) {
            speaker.x = Math.max(25, Math.min(canvas.width - 25, x));
            speaker.y = Math.max(25, Math.min(canvas.height - 25, y));
            this.updateSelectionUI();
            this.render();
        }
    }

    private onMouseUp(): void {
        this.isDragging = false;
    }

    private onDoubleClick(e: MouseEvent): void {
        if (!this.selectedSpeakerId) return;
        
        const speaker = this.speakers.find(s => s.id === this.selectedSpeakerId);
        if (speaker) {
            speaker.rotation = (speaker.rotation + 45) % 360;
            this.updateSelectionUI();
            this.render();
        }
    }

    private updateSelectionUI(): void {
        const selectedSpeaker = this.speakers.find(s => s.id === this.selectedSpeakerId);
        const selectedRegion = regionManager.getSelectedRegion();
        
        this.uiManager.updateSpeakerProperties(selectedSpeaker || null);
        this.uiManager.updateRegionProperties(selectedRegion || null);
    }

    private updateSpeakerCount(): void {
        this.uiManager.updateSpeakerCount(this.speakers.length);
    }

    private calculateSoundField(forceRecalculate: boolean = false): void {
        if (this.speakers.length === 0) {
            this.uiManager.setStatus('请先添加音响设备');
            return;
        }

        this.uiManager.setStatus('正在计算声场...');

        setTimeout(() => {
            const canvas = this.canvasRenderer.getCanvas();
            this.soundFieldResult = AcousticCalculator.calculateSoundField(
                this.speakers,
                canvas.width,
                canvas.height,
                this.acousticParams,
                forceRecalculate
            );

            this.uiManager.updateAnalysisResults(this.soundFieldResult);
            this.render();
            this.uiManager.setStatus('声场计算完成');
        }, 50);
    }

    private render(): void {
        this.canvasRenderer.render(
            this.speakers,
            regionManager.getVisibleRegions(),
            this.soundFieldResult,
            this.selectedSpeakerId,
            regionManager.getSelectedRegion()?.id || null
        );
    }

    private newProject(): void {
        this.speakers = [];
        this.selectedSpeakerId = null;
        this.soundFieldResult = null;
        this.projectName = '未命名工程';
        this.currentFilePath = null;
        
        regionManager.clearRegions();
        
        this.uiManager.updateProjectName(this.projectName);
        this.uiManager.updateSpeakerCount(0);
        this.uiManager.updateAnalysisResults(null);
        this.uiManager.clearClips();
        
        this.timeline.setClips([]);
        this.addDemoClips();
        
        this.updateSelectionUI();
        this.render();
        this.uiManager.setStatus('已创建新工程');
    }

    private async saveProject(saveAs: boolean = false): Promise<void> {
        const project: Project = {
            name: this.projectName,
            speakers: this.speakers,
            audioClips: this.timeline.getClips(),
            acousticParams: this.acousticParams,
            regions: regionManager.getAllRegions(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: 2
        };

        const result = await ipcRenderer.invoke('save-project', project);
        
        if (result.success) {
            this.currentFilePath = result.filePath;
            this.uiManager.setStatus('工程保存成功');
        } else if (!result.canceled) {
            this.uiManager.setStatus('保存失败: ' + result.error);
        }
    }

    private async openProject(): Promise<void> {
        this.uiManager.setStatus('正在加载工程...');
        
        const result = await ipcRenderer.invoke('open-project');
        
        if (result.success) {
            const project: Project = result.projectData;
            this.speakers = project.speakers || [];
            this.acousticParams = project.acousticParams || this.acousticParams;
            this.projectName = project.name;
            this.currentFilePath = result.filePath;
            
            if (project.regions) {
                regionManager.setRegions(project.regions);
            }
            
            this.uiManager.clearClips();
            if (project.audioClips) {
                this.timeline.setClips(project.audioClips);
                project.audioClips.forEach(clip => {
                    this.uiManager.renderClip(clip, this.timeline.getTotalDuration());
                });
            }
            
            this.selectedSpeakerId = null;
            this.soundFieldResult = null;
            
            this.uiManager.updateProjectName(this.projectName);
            this.uiManager.updateParamValues(this.acousticParams);
            this.updateSpeakerCount();
            this.updateSelectionUI();
            this.render();
            this.uiManager.setStatus('工程打开成功');
        } else if (!result.canceled) {
            this.uiManager.setStatus('打开失败: ' + result.error);
        } else {
            this.uiManager.setStatus('就绪');
        }
    }

    private async toggleSimulatorConnection(): Promise<void> {
        if (simulatorClient.isConnected()) {
            simulatorClient.disconnect();
            this.uiManager.updateSimulatorStatus(false);
            this.uiManager.setStatus('已断开模拟器连接');
        } else {
            this.uiManager.setStatus('正在连接模拟器...');
            try {
                const status = await simulatorClient.connect('localhost', 8080);
                this.uiManager.updateSimulatorStatus(true);
                this.uiManager.setStatus(`模拟器已连接 (延迟: ${status.latency}ms)`);
            } catch (e) {
                this.uiManager.setStatus('连接模拟器失败');
            }
        }
    }

    private async sendToSimulator(): Promise<void> {
        try {
            await simulatorClient.sendSpeakerConfig(this.speakers);
            await simulatorClient.sendAcousticParams(this.acousticParams);
            this.uiManager.setStatus('配置已发送到模拟器');
        } catch (e) {
            this.uiManager.setStatus('发送失败: ' + (e as Error).message);
        }
    }

    private startSimulation(): void {
        if (this.speakers.length === 0) {
            this.uiManager.setStatus('请先添加音响设备');
            return;
        }

        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        }

        this.uiManager.setStatus('音效预演中...');
        
        this.speakers.forEach((speaker, index) => {
            setTimeout(() => {
                this.playTone(speaker);
            }, index * 200);
        });

        setTimeout(() => {
            this.uiManager.setStatus('预演完成');
        }, this.speakers.length * 200 + 1000);
    }

    private playTone(speaker: Speaker): void {
        if (!this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        const freq = (speaker.frequencyRange.min + speaker.frequencyRange.max) / 2;
        oscillator.frequency.value = Math.min(2000, Math.max(100, freq));
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime((speaker.volume / 100) * 0.3, this.audioContext.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.5);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.5);
    }

    private playAudioClip(clip: AudioClip): void {
        if (simulatorClient.isConnected()) {
            simulatorClient.triggerPlayback(clip.speakerId, clip.volume);
        }

        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        }

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.value = 440;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime((clip.volume / 100) * 0.2, this.audioContext.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + clip.duration / 1000);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + clip.duration / 1000);
    }

    private applyTemplate(templateId: string): void {
        const canvas = this.canvasRenderer.getCanvas();
        const { speakers, regions } = templateLibrary.applyTemplate(templateId, canvas.width, canvas.height);
        
        if (speakers.length > 0) {
            this.speakers = speakers;
            this.selectedSpeakerId = null;
            this.updateSpeakerCount();
            this.uiManager.setStatus(`已应用模板: ${speakers.length} 个音响`);
        }
        
        if (regions.length > 0) {
            regionManager.setRegions(regions);
        }
        
        this.updateSelectionUI();
        this.render();
    }

    private createTemplate(name: string, description: string, category: TemplateCategory): void {
        const template = templateLibrary.createTemplate(
            name,
            description,
            category,
            this.speakers,
            regionManager.getAllRegions()
        );
        this.uiManager.setStatus(`已创建模板: ${template.name}`);
    }

    private addRegion(type: RegionType): void {
        const canvas = this.canvasRenderer.getCanvas();
        const region = regionManager.addRegion(
            type,
            canvas.width * 0.2 + Math.random() * canvas.width * 0.2,
            canvas.height * 0.3 + Math.random() * canvas.height * 0.2,
            200,
            150
        );
        regionManager.setSelectedRegion(region.id);
        this.selectedSpeakerId = null;
        this.selectionMode = 'region';
        this.updateSelectionUI();
        this.uiManager.setStatus(`已添加区域: ${region.name}`);
    }

    private deleteRegion(id: string): void {
        regionManager.deleteRegion(id);
        this.updateSelectionUI();
        this.render();
        this.uiManager.setStatus('已删除区域');
    }

    private updateRegionProperty(id: string, property: string, value: any): void {
        regionManager.updateRegion(id, { [property]: value });
        this.render();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new App();
});
