import { Speaker, RegionMarker, SoundFieldResult, SoundFieldPoint } from './types';
import { SPEAKER_PRESETS } from './speakerPresets';
import { AcousticCalculator } from './acousticCalculator';

export interface RenderOptions {
    showGrid: boolean;
    showHeatmap: boolean;
    showLabels: boolean;
    heatmapOpacity: number;
}

export class CanvasRenderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private options: RenderOptions = {
        showGrid: true,
        showHeatmap: true,
        showLabels: true,
        heatmapOpacity: 0.6
    };

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
    }

    setOptions(options: Partial<RenderOptions>): void {
        this.options = { ...this.options, ...options };
    }

    getOptions(): RenderOptions {
        return { ...this.options };
    }

    clear(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    render(
        speakers: Speaker[],
        regions: RegionMarker[],
        soundFieldResult: SoundFieldResult | null,
        selectedSpeakerId: string | null,
        selectedRegionId: string | null
    ): void {
        this.clear();
        
        this.drawBackground();
        
        if (this.options.showGrid) {
            this.drawGrid();
        }

        this.drawRegions(regions, selectedRegionId);

        if (this.options.showHeatmap && soundFieldResult) {
            this.drawHeatmap(soundFieldResult.points);
        }

        this.drawSpeakers(speakers, selectedSpeakerId);
    }

    private drawBackground(): void {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, width, height);
    }

    private drawGrid(): void {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        ctx.strokeStyle = 'rgba(45, 58, 90, 0.5)';
        ctx.lineWidth = 1;

        const gridSize = 50;

        for (let x = 0; x <= width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        for (let y = 0; y <= height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
    }

    private drawRegions(regions: RegionMarker[], selectedRegionId: string | null): void {
        const ctx = this.ctx;

        for (const region of regions) {
            if (!region.visible) continue;

            const isSelected = region.id === selectedRegionId;

            ctx.fillStyle = region.color;
            ctx.fillRect(region.x, region.y, region.width, region.height);

            ctx.strokeStyle = isSelected ? '#ffffff' : this.extractBorderColor(region.color);
            ctx.lineWidth = isSelected ? 2 : 1;
            ctx.strokeRect(region.x, region.y, region.width, region.height);

            if (this.options.showLabels) {
                ctx.fillStyle = '#ffffff';
                ctx.font = '12px Segoe UI';
                ctx.textAlign = 'left';
                ctx.fillText(region.name, region.x + 8, region.y + 20);
                
                if (region.targetSpl) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                    ctx.font = '11px Segoe UI';
                    ctx.fillText(`目标: ${region.targetSpl} dB`, region.x + 8, region.y + 36);
                }
            }
        }
    }

    private extractBorderColor(rgba: string): string {
        const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
            const r = Math.min(255, parseInt(match[1]) + 50);
            const g = Math.min(255, parseInt(match[2]) + 50);
            const b = Math.min(255, parseInt(match[3]) + 50);
            return `rgb(${r}, ${g}, ${b})`;
        }
        return '#ffffff';
    }

    private drawHeatmap(points: SoundFieldPoint[]): void {
        const ctx = this.ctx;

        for (const point of points) {
            if (point.spl > 0) {
                ctx.fillStyle = AcousticCalculator.getHeatmapColor(point.spl, this.options.heatmapOpacity);
                ctx.fillRect(point.x - 15, point.y - 15, 30, 30);
            }
        }
    }

    private drawSpeakers(speakers: Speaker[], selectedSpeakerId: string | null): void {
        for (const speaker of speakers) {
            this.drawSpeaker(speaker, speaker.id === selectedSpeakerId);
        }
    }

    private drawSpeaker(speaker: Speaker, isSelected: boolean): void {
        const ctx = this.ctx;
        const preset = SPEAKER_PRESETS[speaker.type];

        ctx.save();
        ctx.translate(speaker.x, speaker.y);
        ctx.rotate((speaker.rotation * Math.PI) / 180);

        if (isSelected) {
            ctx.beginPath();
            ctx.arc(0, 0, 35, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 212, 255, 0.3)';
            ctx.fill();
            ctx.strokeStyle = '#00d4ff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(0, 0, 25, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 25);
        gradient.addColorStop(0, '#4a5568');
        gradient.addColorStop(1, '#2d3748');
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#00d4ff' : '#718096';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(preset.icon, 0, 0);

        ctx.beginPath();
        ctx.moveTo(25, 0);
        ctx.lineTo(35, 0);
        ctx.strokeStyle = isSelected ? '#00d4ff' : '#718096';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();

        if (this.options.showLabels) {
            ctx.fillStyle = '#e0e0e0';
            ctx.font = '11px Segoe UI';
            ctx.textAlign = 'center';
            ctx.fillText(speaker.name, speaker.x, speaker.y + 40);
        }
    }

    resize(): void {
        const container = this.canvas.parentElement;
        if (container) {
            this.canvas.width = container.clientWidth;
            this.canvas.height = container.clientHeight;
        }
    }

    getCanvas(): HTMLCanvasElement {
        return this.canvas;
    }

    getContext(): CanvasRenderingContext2D {
        return this.ctx;
    }
}
