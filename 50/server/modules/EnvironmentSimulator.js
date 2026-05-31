class EnvironmentSimulator {
  constructor() {
    this.temperature = 15;
    this.targetTemperature = 15;
    this.humidity = 50;
    this.targetHumidity = 50;
    this.windSpeed = 5;
    this.targetWindSpeed = 5;
    this.rainIntensity = 0;
    this.targetRainIntensity = 0;
    
    this.isStorm = false;
    this.stormTransition = 0;
    
    this.timeOfDay = 'day';
    this.dayCounter = 0;
    this.season = 0;
    
    this.pressure = 1013;
    this.visibility = 10;
    this.uvIndex = 5;
    
    this.weatherHistory = [];
    this.weatherPattern = 'stable';
    
    this.temperatureTrend = 0;
    this.humidityTrend = 0;
  }

  update() {
    this.updateTime();
    this.updateWeatherPattern();
    this.updateTargetConditions();
    this.smoothTransition();
    this.calculateDerivedParams();
    this.recordHistory();
  }

  updateTime() {
    this.dayCounter++;
    
    const cycleProgress = (this.dayCounter % 120) / 120;
    
    if (cycleProgress < 0.08 || cycleProgress >= 0.75) {
      this.timeOfDay = 'night';
    } else if (cycleProgress < 0.2 || cycleProgress >= 0.65) {
      this.timeOfDay = 'twilight';
    } else {
      this.timeOfDay = 'day';
    }
    
    if (this.dayCounter % 600 === 0) {
      this.season = (this.season + 1) % 4;
    }
  }

  updateWeatherPattern() {
    const patternChangeChance = 0.005;
    
    if (Math.random() < patternChangeChance) {
      const patterns = ['stable', 'warming', 'cooling', 'humid', 'windy', 'unstable'];
      const weights = [0.3, 0.15, 0.15, 0.15, 0.1, 0.15];
      
      let random = Math.random();
      let cumulative = 0;
      
      for (let i = 0; i < patterns.length; i++) {
        cumulative += weights[i];
        if (random < cumulative) {
          this.weatherPattern = patterns[i];
          break;
        }
      }
    }
  }

  updateTargetConditions() {
    let baseTemp = 20;
    
    const seasonOffsets = [-15, -5, 10, 5];
    baseTemp += seasonOffsets[this.season];
    
    if (this.timeOfDay === 'night') {
      baseTemp -= 12;
    } else if (this.timeOfDay === 'twilight') {
      baseTemp -= 5;
    }
    
    switch (this.weatherPattern) {
      case 'warming':
        this.temperatureTrend = Math.min(5, this.temperatureTrend + 0.1);
        break;
      case 'cooling':
        this.temperatureTrend = Math.max(-5, this.temperatureTrend - 0.1);
        break;
      case 'humid':
        this.humidityTrend = Math.min(20, this.humidityTrend + 0.5);
        break;
      case 'windy':
        this.targetWindSpeed = 15 + Math.random() * 15;
        break;
      case 'unstable':
        this.handleUnstableWeather();
        break;
      default:
        this.temperatureTrend *= 0.95;
        this.humidityTrend *= 0.95;
    }
    
    this.targetTemperature = baseTemp + this.temperatureTrend + (Math.random() - 0.5) * 2;
    this.targetHumidity = 50 + this.humidityTrend + (Math.random() - 0.5) * 10;
    
    if (this.rainIntensity > 30) {
      this.targetTemperature -= 2;
      this.targetHumidity = Math.min(95, this.targetHumidity + 10);
    }
    
    this.targetHumidity = Math.max(20, Math.min(98, this.targetHumidity));
    this.targetTemperature = Math.max(-25, Math.min(45, this.targetTemperature));
  }

  handleUnstableWeather() {
    if (!this.isStorm && Math.random() < 0.02) {
      this.isStorm = true;
      this.targetRainIntensity = 60 + Math.random() * 40;
      this.targetWindSpeed = 20 + Math.random() * 15;
    } else if (this.isStorm && Math.random() < 0.01) {
      this.isStorm = false;
      this.targetRainIntensity = Math.random() * 20;
      this.targetWindSpeed = 5 + Math.random() * 10;
    }
    
    if (this.isStorm) {
      this.stormTransition = Math.min(1, this.stormTransition + 0.05);
    } else {
      this.stormTransition = Math.max(0, this.stormTransition - 0.02);
    }
    
    if (this.isStorm && Math.random() < 0.01) {
      this.targetTemperature -= 1 + Math.random() * 2;
    }
  }

  smoothTransition() {
    const tempSmoothFactor = 0.05;
    const humiditySmoothFactor = 0.03;
    const windSmoothFactor = 0.08;
    const rainSmoothFactor = 0.1;
    
    this.temperature += (this.targetTemperature - this.temperature) * tempSmoothFactor;
    this.temperature += (Math.random() - 0.5) * 0.3;
    
    this.humidity += (this.targetHumidity - this.humidity) * humiditySmoothFactor;
    this.humidity += (Math.random() - 0.5) * 0.5;
    
    this.windSpeed += (this.targetWindSpeed - this.windSpeed) * windSmoothFactor;
    this.windSpeed += (Math.random() - 0.5) * 0.5;
    this.windSpeed = Math.max(0, this.windSpeed);
    
    this.rainIntensity += (this.targetRainIntensity - this.rainIntensity) * rainSmoothFactor;
    this.rainIntensity = Math.max(0, Math.min(100, this.rainIntensity));
    
    if (!this.isStorm && this.rainIntensity < 5) {
      this.rainIntensity = Math.max(0, this.rainIntensity - 0.1);
    }
  }

  calculateDerivedParams() {
    this.pressure = 1013 - (this.temperature - 15) * 0.5 - this.humidity * 0.1;
    this.pressure += (Math.random() - 0.5) * 2;
    
    this.visibility = 10;
    if (this.rainIntensity > 50) {
      this.visibility = 2;
    } else if (this.rainIntensity > 20) {
      this.visibility = 5;
    }
    if (this.humidity > 90) {
      this.visibility *= 0.7;
    }
    
    this.uvIndex = 0;
    if (this.timeOfDay === 'day') {
      this.uvIndex = 6 + (this.temperature - 20) * 0.1;
      this.uvIndex = Math.max(1, Math.min(11, this.uvIndex));
      if (this.rainIntensity > 30) {
        this.uvIndex *= 0.5;
      }
    } else if (this.timeOfDay === 'twilight') {
      this.uvIndex = 2;
    }
  }

  recordHistory() {
    const snapshot = {
      time: this.dayCounter,
      temperature: this.temperature,
      humidity: this.humidity,
      windSpeed: this.windSpeed,
      rainIntensity: this.rainIntensity
    };
    
    this.weatherHistory.push(snapshot);
    
    if (this.weatherHistory.length > 60) {
      this.weatherHistory.shift();
    }
  }

  getState() {
    const seasonNames = ['冬季', '春季', '夏季', '秋季'];
    
    return {
      temperature: Math.round(this.temperature * 10) / 10,
      humidity: Math.round(this.humidity),
      windSpeed: Math.round(this.windSpeed * 10) / 10,
      rainIntensity: Math.round(this.rainIntensity),
      isStorm: this.isStorm,
      stormIntensity: Math.round(this.stormTransition * 100) / 100,
      timeOfDay: this.timeOfDay,
      season: seasonNames[this.season],
      seasonIndex: this.season,
      pressure: Math.round(this.pressure),
      visibility: Math.round(this.visibility * 10) / 10,
      uvIndex: Math.round(this.uvIndex * 10) / 10,
      weatherPattern: this.weatherPattern,
      weatherLevel: this.calculateWeatherLevel(),
      forecast: this.generateForecast()
    };
  }

  calculateWeatherLevel() {
    let level = 0;
    
    if (this.temperature < -15 || this.temperature > 38) level += 2;
    else if (this.temperature < -5 || this.temperature > 32) level += 1;
    
    if (this.humidity > 85) level += 1;
    
    if (this.windSpeed > 25) level += 2;
    else if (this.windSpeed > 12) level += 1;
    
    if (this.rainIntensity > 60) level += 2;
    else if (this.rainIntensity > 25) level += 1;
    
    if (this.isStorm && this.stormTransition > 0.5) level += 1;
    
    if (this.uvIndex > 9) level += 1;
    
    return Math.min(5, level);
  }

  generateForecast() {
    const forecasts = [];
    
    for (let i = 1; i <= 3; i++) {
      const futureTemp = this.temperature + (Math.random() - 0.5) * 8;
      const futureRain = Math.max(0, this.rainIntensity + (Math.random() - 0.5) * 40);
      
      forecasts.push({
        period: `${i}小时后`,
        temperature: Math.round(futureTemp),
        rainChance: Math.round(Math.min(100, futureRain)),
        condition: this.describeCondition(futureTemp, futureRain, this.windSpeed)
      });
    }
    
    return forecasts;
  }

  describeCondition(temp, rain, wind) {
    if (rain > 60) return '暴雨';
    if (rain > 30) return '中雨';
    if (rain > 10) return '小雨';
    if (wind > 20) return '大风';
    if (temp > 35) return '高温';
    if (temp < -10) return '严寒';
    return '晴朗';
  }

  getStressFactors() {
    return {
      temperature: Math.abs(this.temperature - 20) / 30,
      humidity: Math.abs(this.humidity - 50) / 50,
      wind: this.windSpeed / 30,
      rain: this.rainIntensity / 100,
      storm: this.stormTransition,
      uv: this.uvIndex / 11
    };
  }

  getTemperatureDelta() {
    if (this.weatherHistory.length < 2) return 0;
    
    const recent = this.weatherHistory.slice(-10);
    const first = recent[0].temperature;
    const last = recent[recent.length - 1].temperature;
    
    return last - first;
  }
}

module.exports = EnvironmentSimulator;
