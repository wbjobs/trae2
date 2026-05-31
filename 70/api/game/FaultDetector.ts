import { Device, FaultType, WeatherType, FAULT_CONFIG, DEVICE_CONFIG } from '../../shared/types';

export class FaultDetector {
  private baseFaultProbability: number = 0.05;
  private cumulativeFaultChance: Map<string, number> = new Map();
  private deviceHealthThresholds = {
    warning: 70,
    fault: 40,
  };
  private durabilityDecayRate: number = 0.02;

  detectFaults(
    device: Device,
    currentWeather: WeatherType,
    weatherIntensity: number,
    deltaTime: number
  ): { newFaults: FaultType[]; healthChange: number; durabilityChange: number } {
    const newFaults: FaultType[] = [];
    let healthChange = 0;
    let durabilityChange = 0;

    const deviceConfig = DEVICE_CONFIG[device.type];
    const isAffectedByWeather = deviceConfig.affectedBy.includes(currentWeather);
    
    if (isAffectedByWeather) {
      healthChange = -0.1 * weatherIntensity * (deltaTime / 1000);
      durabilityChange = -this.durabilityDecayRate * weatherIntensity * (deltaTime / 1000);
    } else {
      durabilityChange = -this.durabilityDecayRate * 0.3 * (deltaTime / 1000);
    }

    const durabilityFactor = 1 + (100 - device.durability) / 100;

    const applicableFaults = Object.entries(FAULT_CONFIG).filter(([_, config]) => 
      config.causedBy.includes(currentWeather)
    ) as [FaultType, typeof FAULT_CONFIG[FaultType]][];

    if (applicableFaults.length > 0 && device.status !== 'repairing') {
      const weatherMultiplier = isAffectedByWeather ? 2.5 : 0.8;
      const healthMultiplier = 1 + (100 - device.health) / 50;
      const timeMultiplier = deltaTime / 1000;

      let cumulativeChance = this.cumulativeFaultChance.get(device.id) || 0;
      cumulativeChance += 0.01 * weatherIntensity * timeMultiplier * durabilityFactor;

      const baseProbability = Math.min(0.8, this.baseFaultProbability * 
        weatherIntensity * 
        healthMultiplier * 
        timeMultiplier * 
        weatherMultiplier *
        durabilityFactor +
        cumulativeChance * 0.5);

      applicableFaults.forEach(([faultType, config]) => {
        const difficultyFactor = (5 - config.repairDifficulty) / 3;
        const finalProbability = baseProbability * difficultyFactor;

        if (!device.faults.includes(faultType) && Math.random() < finalProbability) {
          newFaults.push(faultType);
          cumulativeChance = 0;
          healthChange -= 5;
          durabilityChange -= config.durabilityDamage;
        }
      });

      this.cumulativeFaultChance.set(device.id, Math.min(0.5, cumulativeChance));
    }

    if (device.status === 'repairing' && device.faults.length === 0) {
      healthChange += 2;
    }

    return { newFaults, healthChange, durabilityChange };
  }

  calculateDeviceStatus(health: number, durability: number, faultCount: number): 'normal' | 'warning' | 'fault' {
    if (faultCount > 1 || health < this.deviceHealthThresholds.fault || durability < 20) {
      return 'fault';
    }
    if (faultCount > 0 || health < this.deviceHealthThresholds.warning || durability < 50) {
      return 'warning';
    }
    return 'normal';
  }

  repairDevice(device: Device, faultIndex: number): Device {
    const updatedDevice = { ...device };
    
    if (faultIndex >= 0 && faultIndex < device.faults.length) {
      const fault = device.faults[faultIndex];
      const faultConfig = FAULT_CONFIG[fault];
      
      updatedDevice.faults = [...device.faults];
      updatedDevice.faults.splice(faultIndex, 1);
      
      const healthRecovery = 20;
      const durabilityRecovery = Math.max(0, 10 - faultConfig.durabilityDamage / 2);
      
      updatedDevice.health = Math.min(100, device.health + healthRecovery);
      updatedDevice.durability = Math.min(100, device.durability + durabilityRecovery);
      updatedDevice.lastMaintenanceTime = Date.now();
    }
    
    return updatedDevice;
  }

  performMaintenance(device: Device, maintenanceType: string): Device {
    const updatedDevice = { ...device };
    
    switch (maintenanceType) {
      case 'inspect':
        updatedDevice.durability = Math.min(100, device.durability + 5);
        break;
      case 'calibrate':
        updatedDevice.durability = Math.min(100, device.durability + 8);
        updatedDevice.health = Math.min(100, device.health + 5);
        break;
      case 'maintenance':
        updatedDevice.durability = Math.min(100, device.durability + 15);
        updatedDevice.health = Math.min(100, device.health + 10);
        break;
      case 'replace':
        updatedDevice.durability = 100;
        updatedDevice.health = Math.min(100, device.health + 20);
        break;
    }
    
    updatedDevice.lastMaintenanceTime = Date.now();
    return updatedDevice;
  }

  generateDeviceValue(device: Device, weather: WeatherType, intensity: number): number {
    const config = DEVICE_CONFIG[device.type];
    const baseValue = (config.minValue + config.maxValue) / 2;
    const range = config.maxValue - config.minValue;
    
    let weatherModifier = 0;
    switch (device.type) {
      case 'anemometer':
        weatherModifier = weather === 'stormy' ? 0.7 : weather === 'rainy' ? 0.35 : weather === 'snowy' ? 0.2 : 0.05;
        break;
      case 'thermometer':
        weatherModifier = weather === 'sunny' ? 0.35 : 
                         weather === 'cloudy' ? 0.1 :
                         (weather === 'snowy' || weather === 'frosty') ? -0.45 : 
                         weather === 'rainy' ? -0.15 : 0;
        break;
      case 'hygrometer':
        weatherModifier = (weather === 'rainy' || weather === 'stormy') ? 0.55 : 
                         weather === 'frosty' ? 0.35 :
                         weather === 'snowy' ? 0.25 :
                         weather === 'cloudy' ? 0.15 : 0;
        break;
      case 'barometer':
        weatherModifier = weather === 'stormy' ? -0.35 : 
                         weather === 'rainy' ? -0.15 :
                         weather === 'sunny' ? 0.2 : 
                         weather === 'snowy' ? -0.1 : 0;
        break;
      case 'rain_gauge':
        weatherModifier = (weather === 'rainy' || weather === 'stormy') ? intensity * 0.85 : 
                         weather === 'snowy' ? intensity * 0.35 : 0;
        break;
      case 'wind_vane':
        return Math.random() * 360;
    }

    const durabilityFactor = device.durability < 50 ? (1 - (50 - device.durability) / 200) : 1;
    const drift = device.faults.includes('sensor_drift') ? (Math.random() - 0.5) * 0.35 : (Math.random() - 0.5) * 0.05;
    const noise = (Math.random() - 0.5) * 0.08;
    const isOffline = device.faults.includes('connection_loss') || device.faults.includes('power_failure');

    if (isOffline) {
      return device.value;
    }

    if (device.faults.includes('mechanical_jam') && (device.type === 'anemometer' || (device.type as string) === 'wind_vane')) {
      return baseValue;
    }

    if (device.faults.includes('icing')) {
      weatherModifier *= 0.3;
    }

    if (device.faults.includes('water_damage')) {
      weatherModifier += (Math.random() - 0.5) * 0.2;
    }

    const newValue = baseValue + range * (weatherModifier * durabilityFactor + drift + noise);
    return Math.max(config.minValue, Math.min(config.maxValue, newValue));
  }

  diagnoseDevice(device: Device): FaultType[] {
    const visibleFaults: FaultType[] = [];
    const hiddenFaults: FaultType[] = [];

    device.faults.forEach(fault => {
      const detectRate = device.durability > 70 ? 0.95 : device.durability > 40 ? 0.85 : 0.7;
      if (Math.random() < detectRate) {
        visibleFaults.push(fault);
      } else {
        hiddenFaults.push(fault);
      }
    });

    if (hiddenFaults.length > 0) {
      console.log(`Device ${device.id} has hidden faults: ${hiddenFaults.join(', ')}`);
    }

    return visibleFaults;
  }

  resetCumulativeChance(deviceId: string): void {
    this.cumulativeFaultChance.delete(deviceId);
  }

  getDurabilityDecayRate(): number {
    return this.durabilityDecayRate;
  }
}
