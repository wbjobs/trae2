import { RegionMarker, RegionType } from './types';

const REGION_COLORS: Record<RegionType, string> = {
    stage: 'rgba(0, 212, 255, 0.3)',
    audience: 'rgba(16, 185, 129, 0.2)',
    vip: 'rgba(245, 158, 11, 0.3)',
    backstage: 'rgba(139, 92, 246, 0.3)',
    custom: 'rgba(236, 72, 153, 0.3)'
};

const REGION_NAMES: Record<RegionType, string> = {
    stage: '舞台区',
    audience: '观众区',
    vip: 'VIP区',
    backstage: '后台区',
    custom: '自定义区'
};

export class RegionManager {
    private regions: RegionMarker[] = [];
    private selectedRegionId: string | null = null;
    private eventListeners: Map<string, Function[]> = new Map();

    getAllRegions(): RegionMarker[] {
        return [...this.regions].sort((a, b) => a.priority - b.priority);
    }

    getVisibleRegions(): RegionMarker[] {
        return this.getAllRegions().filter(r => r.visible);
    }

    getRegion(id: string): RegionMarker | undefined {
        return this.regions.find(r => r.id === id);
    }

    getSelectedRegion(): RegionMarker | undefined {
        return this.regions.find(r => r.id === this.selectedRegionId);
    }

    setSelectedRegion(id: string | null): void {
        this.selectedRegionId = id;
        this.emit('selection-changed', id);
    }

    addRegion(type: RegionType, x: number, y: number, width: number, height: number): RegionMarker {
        const count = this.regions.filter(r => r.type === type).length + 1;
        const region: RegionMarker = {
            id: `region-${Date.now()}`,
            name: `${REGION_NAMES[type]} ${count}`,
            type,
            x,
            y,
            width,
            height,
            color: REGION_COLORS[type],
            priority: this.regions.length + 1,
            visible: true,
            targetSpl: 90
        };

        this.regions.push(region);
        this.emit('region-added', region);
        return region;
    }

    updateRegion(id: string, updates: Partial<RegionMarker>): boolean {
        const index = this.regions.findIndex(r => r.id === id);
        if (index === -1) return false;

        this.regions[index] = { ...this.regions[index], ...updates };
        this.emit('region-updated', this.regions[index]);
        return true;
    }

    deleteRegion(id: string): boolean {
        const index = this.regions.findIndex(r => r.id === id);
        if (index === -1) return false;

        const deleted = this.regions.splice(index, 1)[0];
        if (this.selectedRegionId === id) {
            this.selectedRegionId = null;
        }
        this.emit('region-deleted', deleted);
        return true;
    }

    setRegions(regions: RegionMarker[]): void {
        this.regions = [...regions];
        this.selectedRegionId = null;
        this.emit('regions-reset', this.regions);
    }

    clearRegions(): void {
        this.regions = [];
        this.selectedRegionId = null;
        this.emit('regions-cleared', {});
    }

    getRegionAtPoint(x: number, y: number): RegionMarker | undefined {
        for (const region of this.getAllRegions()) {
            if (!region.visible) continue;
            if (x >= region.x && x <= region.x + region.width &&
                y >= region.y && y <= region.y + region.height) {
                return region;
            }
        }
        return undefined;
    }

    getRegionColor(type: RegionType): string {
        return REGION_COLORS[type];
    }

    getRegionTypeName(type: RegionType): string {
        return REGION_NAMES[type];
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

export const regionManager = new RegionManager();
