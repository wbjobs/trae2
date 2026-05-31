import { Speaker, AcousticParams } from './types';

export interface SimulatorStatus {
    connected: boolean;
    latency: number;
    version?: string;
}

export class SimulatorClient {
    private connected: boolean = false;
    private host: string = 'localhost';
    private port: number = 8080;
    private eventListeners: Map<string, Function[]> = new Map();

    connect(host: string, port: number): Promise<SimulatorStatus> {
        return new Promise((resolve) => {
            setTimeout(() => {
                this.host = host;
                this.port = port;
                this.connected = true;
                this.emit('connected', { host, port });
                
                resolve({
                    connected: true,
                    latency: 12,
                    version: 'v1.2.0'
                });
            }, 500);
        });
    }

    disconnect(): void {
        this.connected = false;
        this.emit('disconnected', {});
    }

    isConnected(): boolean {
        return this.connected;
    }

    sendSpeakerConfig(speakers: Speaker[]): Promise<boolean> {
        return new Promise((resolve, reject) => {
            if (!this.connected) {
                reject(new Error('模拟器未连接'));
                return;
            }

            setTimeout(() => {
                console.log('发送音响配置到模拟器:', speakers.length, '个音响');
                this.emit('config-sent', { speakers });
                resolve(true);
            }, 200);
        });
    }

    sendAcousticParams(params: AcousticParams): Promise<boolean> {
        return new Promise((resolve, reject) => {
            if (!this.connected) {
                reject(new Error('模拟器未连接'));
                return;
            }

            setTimeout(() => {
                console.log('发送声学参数到模拟器:', params);
                this.emit('params-sent', { params });
                resolve(true);
            }, 100);
        });
    }

    triggerPlayback(speakerId: string, volume: number): Promise<boolean> {
        return new Promise((resolve, reject) => {
            if (!this.connected) {
                reject(new Error('模拟器未连接'));
                return;
            }

            setTimeout(() => {
                console.log(`触发音响 ${speakerId} 播放, 音量: ${volume}`);
                this.emit('playback', { speakerId, volume });
                resolve(true);
            }, 50);
        });
    }

    stopPlayback(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            if (!this.connected) {
                reject(new Error('模拟器未连接'));
                return;
            }

            setTimeout(() => {
                console.log('停止所有播放');
                this.emit('stopped', {});
                resolve(true);
            }, 50);
        });
    }

    getStatus(): SimulatorStatus {
        return {
            connected: this.connected,
            latency: this.connected ? 12 : 0
        };
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

export const simulatorClient = new SimulatorClient();
