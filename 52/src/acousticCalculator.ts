import { Speaker, AcousticParams, SoundFieldResult, SoundFieldPoint } from './types';

const REFERENCE_SPL = 112;
const REFERENCE_DISTANCE = 1;
const BASE_GRID_RESOLUTION = 30;
const MAX_CALCULATION_POINTS = 5000;
const CACHE_EXPIRY_MS = 5000;

interface CalculationCache {
    hash: string;
    result: SoundFieldResult;
    timestamp: number;
}

export class AcousticCalculator {
    private static cache: CalculationCache | null = null;

    static calculateSoundField(
        speakers: Speaker[],
        width: number,
        height: number,
        params: AcousticParams,
        forceRecalculate: boolean = false
    ): SoundFieldResult {
        const hash = this.generateHash(speakers, width, height, params);
        
        if (!forceRecalculate && this.cache && this.cache.hash === hash) {
            if (Date.now() - this.cache.timestamp < CACHE_EXPIRY_MS) {
                return this.cache.result;
            }
        }

        const gridResolution = this.calculateOptimalResolution(width, height);
        
        const points: SoundFieldPoint[] = [];
        const airAbsorption = this.calculateAirAbsorption(params);
        
        const speakerData = speakers.map(speaker => ({
            x: speaker.x,
            y: speaker.y,
            power: speaker.power,
            volume: speaker.volume,
            directivity: speaker.directivity,
            powerLog: 10 * Math.log10(Math.max(speaker.power, 1) / 1000),
            volumeLog: 20 * Math.log10(speaker.volume / 100)
        }));

        for (let y = 0; y < height; y += gridResolution) {
            for (let x = 0; x < width; x += gridResolution) {
                let totalPressure = 0;
                
                for (const sd of speakerData) {
                    const dx = x - sd.x;
                    const dy = y - sd.y;
                    const distance = Math.sqrt(dx * dx + dy * dy) / 50;
                    
                    if (distance < 0.1) continue;
                    
                    const baseSPL = REFERENCE_SPL + sd.powerLog;
                    const distanceLoss = 20 * Math.log10(distance / REFERENCE_DISTANCE);
                    const airLoss = airAbsorption * distance;
                    const directivityLoss = this.calculateDirectivityLoss(sd.directivity, params.frequency);
                    
                    const spl = baseSPL - distanceLoss - airLoss - directivityLoss + sd.volumeLog;
                    
                    if (spl > 0) {
                        totalPressure += Math.pow(10, spl / 20);
                    }
                }
                
                const totalSPL = totalPressure > 0 ? 20 * Math.log10(totalPressure) : 0;
                
                points.push({
                    x,
                    y,
                    spl: Math.max(0, Math.min(140, totalSPL))
                });
            }
        }
        
        const splValues = points.map(p => p.spl);
        const validSpls = splValues.filter(v => v > 0);
        const maxSpl = validSpls.length > 0 ? Math.max(...splValues) : 0;
        const minSpl = validSpls.length > 0 ? Math.min(...validSpls) : 0;
        const uniformity = maxSpl - minSpl;
        const coverage = this.calculateCoverage(points, 85);
        
        const result: SoundFieldResult = {
            points,
            maxSpl,
            minSpl,
            uniformity,
            coverage
        };

        this.cache = {
            hash,
            result,
            timestamp: Date.now()
        };
        
        return result;
    }

    private static calculateOptimalResolution(width: number, height: number): number {
        const area = width * height;
        const basePoints = (width / BASE_GRID_RESOLUTION) * (height / BASE_GRID_RESOLUTION);
        
        if (basePoints <= MAX_CALCULATION_POINTS) {
            return BASE_GRID_RESOLUTION;
        }
        
        const scaleFactor = Math.sqrt(basePoints / MAX_CALCULATION_POINTS);
        return Math.round(BASE_GRID_RESOLUTION * scaleFactor);
    }

    private static generateHash(
        speakers: Speaker[],
        width: number,
        height: number,
        params: AcousticParams
    ): string {
        const speakerInfo = speakers.map(s => 
            `${s.id}:${s.x.toFixed(1)},${s.y.toFixed(1)},${s.volume},${s.power},${s.directivity}`
        ).join('|');
        
        return `${width}x${height}|${params.frequency}|${params.temperature}|${params.humidity}|${speakerInfo}`;
    }

    private static calculateAirAbsorption(params: AcousticParams): number {
        const { frequency, temperature, humidity } = params;
        
        const f = frequency / 1000;
        const T = temperature + 273.15;
        const T0 = 293.15;
        const T01 = 273.16;
        
        const psat = Math.exp(-6.8346 * Math.pow(T01 / T, 1.261) + 4.6151);
        const h = humidity * psat / 100;
        
        const frO = 24 + 4.04e4 * h * (0.02 + h) / (0.391 + h);
        const frN = (T / T0) * (-0.5) * (9 + 280 * h * Math.exp(-4.17 * (Math.pow(T / T0, (-1/3)) - 1)));
        
        const alphaO = f * f * frO / (f * f + frO * frO);
        const alphaN = f * f * frN / (f * f + frN * frN);
        
        return 8.686 * Math.pow(T / T0, -2.5) * (0.01275 * Math.exp(-2239.1 / T) * alphaO + alphaN * 0.1068 * Math.exp(-3352 / T));
    }

    private static calculateDirectivityLoss(directivity: number, frequency: number): number {
        const qFactor = 360 / directivity;
        const di = 10 * Math.log10(qFactor);
        
        return Math.max(0, 6 - di);
    }

    private static calculateCoverage(
        points: SoundFieldPoint[],
        threshold: number
    ): number {
        const validPoints = points.filter(p => p.spl > 0);
        if (validPoints.length === 0) return 0;
        
        let coveredCount = 0;
        for (const point of validPoints) {
            if (point.spl >= threshold) {
                coveredCount++;
            }
        }
        
        return (coveredCount / validPoints.length) * 100;
    }

    static getHeatmapColor(spl: number, opacity: number = 0.6): string {
        const normalized = Math.min(1, Math.max(0, (spl - 60) / 60));
        
        let r: number, g: number, b: number;
        
        if (normalized < 0.25) {
            const t = normalized / 0.25;
            r = 0;
            g = Math.floor(255 * t);
            b = 255;
        } else if (normalized < 0.5) {
            const t = (normalized - 0.25) / 0.25;
            r = 0;
            g = 255;
            b = Math.floor(255 * (1 - t));
        } else if (normalized < 0.75) {
            const t = (normalized - 0.5) / 0.25;
            r = Math.floor(255 * t);
            g = 255;
            b = 0;
        } else {
            const t = (normalized - 0.75) / 0.25;
            r = 255;
            g = Math.floor(255 * (1 - t));
            b = 0;
        }
        
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }

    static clearCache(): void {
        this.cache = null;
    }
}
