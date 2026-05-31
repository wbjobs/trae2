import { WeatherType, WEATHER_CONFIG } from '../../shared/types';

export class WeatherSimulator {
  private currentWeather: WeatherType = 'sunny';
  private weatherIntensity: number = 0.5;
  private weatherTransitionProgress: number = 0;
  private targetWeather: WeatherType = 'sunny';
  private changeInterval: number = 20000;
  private lastChangeTime: number = 0;
  private intensitySmoothing: number = 0.5;
  private targetIntensity: number = 0.5;

  private weatherTransitionMatrix: Record<WeatherType, WeatherType[]> = {
    sunny: ['sunny', 'sunny', 'sunny', 'cloudy'],
    cloudy: ['sunny', 'cloudy', 'cloudy', 'cloudy', 'rainy'],
    rainy: ['cloudy', 'cloudy', 'rainy', 'rainy', 'stormy', 'snowy'],
    stormy: ['rainy', 'rainy', 'stormy', 'cloudy', 'cloudy'],
    snowy: ['rainy', 'snowy', 'snowy', 'frosty', 'cloudy'],
    frosty: ['snowy', 'frosty', 'frosty', 'cloudy', 'cloudy'],
  };

  private weatherIntensityRange: Record<WeatherType, [number, number]> = {
    sunny: [0.2, 0.6],
    cloudy: [0.3, 0.7],
    rainy: [0.4, 0.85],
    stormy: [0.7, 1.0],
    snowy: [0.5, 0.9],
    frosty: [0.4, 0.85],
  };

  constructor(initialWeather: WeatherType = 'sunny') {
    this.currentWeather = initialWeather;
    this.targetWeather = initialWeather;
    const intensityRange = this.weatherIntensityRange[initialWeather];
    this.weatherIntensity = (intensityRange[0] + intensityRange[1]) / 2;
    this.targetIntensity = this.weatherIntensity;
  }

  tick(currentTime: number, deltaTime: number): { weather: WeatherType; intensity: number; changed: boolean } {
    let changed = false;

    if (currentTime - this.lastChangeTime > this.changeInterval) {
      this.lastChangeTime = currentTime;
      const transitions = this.weatherTransitionMatrix[this.currentWeather];
      this.targetWeather = transitions[Math.floor(Math.random() * transitions.length)];
      this.weatherTransitionProgress = 0;
      
      const targetIntensityRange = this.weatherIntensityRange[this.targetWeather];
      this.targetIntensity = targetIntensityRange[0] + Math.random() * (targetIntensityRange[1] - targetIntensityRange[0]);
    }

    if (this.currentWeather !== this.targetWeather) {
      this.weatherTransitionProgress += deltaTime / 8000;
      
      if (this.weatherTransitionProgress >= 1) {
        this.currentWeather = this.targetWeather;
        this.weatherTransitionProgress = 0;
        changed = true;
      }
    }

    const intensityDiff = this.targetIntensity - this.weatherIntensity;
    this.weatherIntensity += intensityDiff * (deltaTime / 2000);
    
    const jitter = (Math.random() - 0.5) * 0.05;
    this.weatherIntensity += jitter;
    
    const currentRange = this.weatherIntensityRange[this.currentWeather];
    this.weatherIntensity = Math.max(currentRange[0], Math.min(currentRange[1], this.weatherIntensity));

    return {
      weather: this.currentWeather,
      intensity: this.weatherIntensity,
      changed,
    };
  }

  getCurrentWeather(): WeatherType {
    return this.currentWeather;
  }

  getWeatherIntensity(): number {
    return this.weatherIntensity;
  }

  getTargetWeather(): WeatherType {
    return this.targetWeather;
  }

  getTransitionProgress(): number {
    return this.weatherTransitionProgress;
  }

  getConfig() {
    return WEATHER_CONFIG[this.currentWeather];
  }

  getLightingIntensity(): number {
    const baseIntensity = WEATHER_CONFIG[this.currentWeather].ambientIntensity;
    return baseIntensity * (0.7 + this.weatherIntensity * 0.3);
  }

  getFogDensity(): number {
    const baseDensity = WEATHER_CONFIG[this.currentWeather].fogDensity;
    return baseDensity * (0.8 + this.weatherIntensity * 0.4);
  }

  setWeather(weather: WeatherType): void {
    this.currentWeather = weather;
    this.targetWeather = weather;
    this.weatherTransitionProgress = 0;
    const intensityRange = this.weatherIntensityRange[weather];
    this.weatherIntensity = (intensityRange[0] + intensityRange[1]) / 2;
    this.targetIntensity = this.weatherIntensity;
  }

  getHealthDecayRate(): number {
    return WEATHER_CONFIG[this.currentWeather].healthDecayRate * this.weatherIntensity * 1.5;
  }

  getFaultMultiplier(): number {
    return WEATHER_CONFIG[this.currentWeather].faultMultiplier * (0.8 + this.weatherIntensity * 0.4);
  }

  getWindEffect(): number {
    if (this.currentWeather === 'stormy') return 2.5 * this.weatherIntensity;
    if (this.currentWeather === 'rainy') return 1.2 * this.weatherIntensity;
    if (this.currentWeather === 'snowy') return 0.8 * this.weatherIntensity;
    return 0.3;
  }

  getPrecipitationLevel(): number {
    if (this.currentWeather === 'rainy' || this.currentWeather === 'stormy') return this.weatherIntensity;
    if (this.currentWeather === 'snowy') return this.weatherIntensity * 0.7;
    return 0;
  }
}
