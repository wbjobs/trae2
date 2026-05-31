import { AudioClip } from './types';

export class TimelineController {
    private currentTime: number = 0;
    private totalDuration: number = 10000;
    private isPlaying: boolean = false;
    private clips: AudioClip[] = [];
    private startTime: number = 0;
    private animationId: number | null = null;
    private eventListeners: Map<string, Function[]> = new Map();
    private onClipTrigger: ((clip: AudioClip) => void) | null = null;
    private triggeredClips: Set<string> = new Set();
    private lastTickTime: number = 0;
    private scheduledTimeouts: Map<string, number> = new Map();

    setClips(clips: AudioClip[]): void {
        this.clearScheduledTimeouts();
        this.clips = [...clips].sort((a, b) => a.startTime - b.startTime);
        this.triggeredClips.clear();
        this.emit('clips-changed', this.clips);
    }

    addClip(clip: AudioClip): void {
        this.clips.push(clip);
        this.clips.sort((a, b) => a.startTime - b.startTime);
        this.scheduleClipTrigger(clip);
        this.emit('clips-changed', this.clips);
    }

    removeClip(clipId: string): void {
        this.clips = this.clips.filter(c => c.id !== clipId);
        this.triggeredClips.delete(clipId);
        this.clearScheduledTimeout(clipId);
        this.emit('clips-changed', this.clips);
    }

    getClips(): AudioClip[] {
        return [...this.clips];
    }

    setOnClipTrigger(callback: (clip: AudioClip) => void): void {
        this.onClipTrigger = callback;
    }

    play(): void {
        if (this.isPlaying) return;
        
        this.isPlaying = true;
        this.lastTickTime = performance.now();
        this.startTime = this.lastTickTime - this.currentTime;
        this.emit('play', this.currentTime);
        
        this.scheduleAllUpcomingClips();
        this.tick();
    }

    pause(): void {
        this.isPlaying = false;
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.clearScheduledTimeouts();
        this.emit('pause', this.currentTime);
    }

    stop(): void {
        this.isPlaying = false;
        this.currentTime = 0;
        this.triggeredClips.clear();
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.clearScheduledTimeouts();
        this.emit('stop', 0);
    }

    seek(time: number): void {
        const wasPlaying = this.isPlaying;
        if (wasPlaying) {
            this.pause();
        }
        
        this.currentTime = Math.max(0, Math.min(this.totalDuration, time));
        this.triggeredClips.clear();
        
        this.clips.forEach(clip => {
            if (clip.startTime < this.currentTime) {
                this.triggeredClips.add(clip.id);
            }
        });
        
        this.emit('seek', this.currentTime);
        
        if (wasPlaying) {
            this.play();
        }
    }

    getCurrentTime(): number {
        return this.currentTime;
    }

    getTotalDuration(): number {
        return this.totalDuration;
    }

    setTotalDuration(duration: number): void {
        this.totalDuration = duration;
        this.emit('duration-changed', duration);
    }

    private tick(): void {
        if (!this.isPlaying) return;

        const now = performance.now();
        const deltaTime = now - this.lastTickTime;
        this.lastTickTime = now;
        
        this.currentTime = now - this.startTime;

        if (this.currentTime >= this.totalDuration) {
            this.currentTime = this.totalDuration;
            this.stop();
            return;
        }

        this.checkClipTriggers();
        this.emit('time-update', this.currentTime);

        if (deltaTime < 16) {
            this.animationId = requestAnimationFrame(() => this.tick());
        } else {
            this.animationId = requestAnimationFrame(() => this.tick());
        }
    }

    private checkClipTriggers(): void {
        for (const clip of this.clips) {
            if (this.currentTime >= clip.startTime && 
                !this.triggeredClips.has(clip.id) &&
                this.onClipTrigger) {
                this.triggeredClips.add(clip.id);
                this.onClipTrigger(clip);
            }
        }
    }

    private scheduleAllUpcomingClips(): void {
        this.clearScheduledTimeouts();
        
        if (!this.isPlaying) return;
        
        for (const clip of this.clips) {
            if (clip.startTime > this.currentTime && !this.triggeredClips.has(clip.id)) {
                this.scheduleClipTrigger(clip);
            }
        }
    }

    private scheduleClipTrigger(clip: AudioClip): void {
        if (!this.isPlaying) return;
        if (clip.startTime <= this.currentTime) return;
        
        const delay = clip.startTime - this.currentTime;
        const timeoutId = window.setTimeout(() => {
            if (this.isPlaying && !this.triggeredClips.has(clip.id) && this.onClipTrigger) {
                this.triggeredClips.add(clip.id);
                this.onClipTrigger(clip);
            }
            this.scheduledTimeouts.delete(clip.id);
        }, Math.max(0, delay));
        
        this.scheduledTimeouts.set(clip.id, timeoutId);
    }

    private clearScheduledTimeout(clipId: string): void {
        const timeoutId = this.scheduledTimeouts.get(clipId);
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
            this.scheduledTimeouts.delete(clipId);
        }
    }

    private clearScheduledTimeouts(): void {
        for (const timeoutId of this.scheduledTimeouts.values()) {
            clearTimeout(timeoutId);
        }
        this.scheduledTimeouts.clear();
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

    static formatTime(ms: number): string {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        const milliseconds = Math.floor(ms % 1000);
        
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
    }
}
