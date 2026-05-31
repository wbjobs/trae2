class FaultDetector {
  constructor() {
    this.faultTypes = {
      power_failure: {
        name: '电源故障',
        causes: ['low_temperature', 'water_damage'],
        baseProbability: 0.008,
        affectedBy: ['temperature', 'humidity']
      },
      sensor_drift: {
        name: '传感器漂移',
        causes: ['high_temperature', 'humidity', 'temperature_fluctuation'],
        baseProbability: 0.006,
        affectedBy: ['temperature', 'humidity']
      },
      communication_loss: {
        name: '通信中断',
        causes: ['wind_damage', 'storm', 'signal_interference'],
        baseProbability: 0.004,
        affectedBy: ['wind', 'storm']
      },
      water_damage: {
        name: '进水损坏',
        causes: ['heavy_rain', 'high_humidity'],
        baseProbability: 0.01,
        affectedBy: ['rain', 'humidity']
      },
      structural_damage: {
        name: '结构损坏',
        causes: ['high_wind', 'storm', 'ice_formation'],
        baseProbability: 0.007,
        affectedBy: ['wind', 'storm', 'temperature']
      },
      calibration_error: {
        name: '校准错误',
        causes: ['temperature_fluctuation', 'vibration'],
        baseProbability: 0.005,
        affectedBy: ['temperature', 'wind']
      },
      battery_drain: {
        name: '电池耗尽',
        causes: ['low_temperature', 'no_sunlight', 'high_load'],
        baseProbability: 0.008,
        affectedBy: ['temperature', 'timeOfDay']
      },
      signal_interference: {
        name: '信号干扰',
        causes: ['storm', 'high_humidity', 'atmospheric_noise'],
        baseProbability: 0.006,
        affectedBy: ['storm', 'humidity']
      }
    };

    this.lastTemperature = 15;
    this.temperatureFluctuation = 0;
  }

  detectFaults(equipmentList, environment) {
    const newFaults = [];

    this.calculateTemperatureFluctuation(environment.temperature);

    equipmentList.forEach(eq => {
      if (eq.status === 'critical') return;

      Object.entries(this.faultTypes).forEach(([type, info]) => {
        if (eq.faults && eq.faults.includes(type)) return;

        const probability = this.calculateFaultProbability(type, info, eq, environment);

        if (Math.random() < probability) {
          newFaults.push({
            equipmentId: eq.id,
            equipmentName: eq.name,
            type,
            name: info.name,
            timestamp: Date.now(),
            severity: this.calculateSeverity(type, environment)
          });
        }
      });
    });

    return newFaults;
  }

  calculateTemperatureFluctuation(currentTemp) {
    this.temperatureFluctuation = Math.abs(currentTemp - this.lastTemperature);
    this.lastTemperature = currentTemp;
  }

  calculateFaultProbability(type, info, eq, environment) {
    let probability = info.baseProbability;

    if (environment.weatherLevel > 0) {
      probability *= (1 + environment.weatherLevel * 0.25);
    }

    if (eq.health < 40) {
      probability *= 2;
    } else if (eq.health < 60) {
      probability *= 1.5;
    } else if (eq.health < 80) {
      probability *= 1.2;
    }

    const eqSpecs = eq.specs || {
      temperatureResistance: [-20, 50],
      waterResistance: 0.6,
      windResistance: 20
    };

    const tempStress = this.calculateTemperatureStress(environment.temperature, eqSpecs.temperatureResistance);
    const waterStress = this.calculateWaterStress(environment, eqSpecs.waterResistance);
    const windStress = this.calculateWindStress(environment.windSpeed, eqSpecs.windResistance);

    switch (type) {
      case 'power_failure':
        probability *= (1 + tempStress * 2 + waterStress);
        break;
      case 'sensor_drift':
        probability *= (1 + tempStress * 1.5 + waterStress * 0.5 + this.temperatureFluctuation * 0.3);
        break;
      case 'communication_loss':
        probability *= (1 + windStress * 2 + (environment.isStorm ? 1 : 0));
        break;
      case 'water_damage':
        probability *= (1 + waterStress * 3);
        break;
      case 'structural_damage':
        probability *= (1 + windStress * 2.5 + (environment.isStorm ? 1 : 0) + (environment.temperature < -5 ? 0.5 : 0));
        break;
      case 'calibration_error':
        probability *= (1 + this.temperatureFluctuation * 0.5 + windStress * 0.5);
        break;
      case 'battery_drain':
        probability *= (1 + Math.max(0, (-environment.temperature - 10)) * 0.1 + (environment.timeOfDay === 'night' ? 0.5 : 0));
        break;
      case 'signal_interference':
        probability *= (1 + (environment.isStorm ? 1.5 : 0) + (environment.humidity > 80 ? 0.5 : 0));
        break;
    }

    return Math.min(0.15, probability);
  }

  calculateTemperatureStress(temperature, resistanceRange) {
    const [minTemp, maxTemp] = resistanceRange;
    
    if (temperature < minTemp) {
      return Math.min(1, (minTemp - temperature) / 20);
    } else if (temperature > maxTemp) {
      return Math.min(1, (temperature - maxTemp) / 20);
    }
    return 0;
  }

  calculateWaterStress(environment, waterResistance) {
    let stress = 0;
    
    if (environment.rainIntensity > 0) {
      stress += (environment.rainIntensity / 100) * (1 - waterResistance) * 2;
    }
    
    if (environment.humidity > 70) {
      stress += ((environment.humidity - 70) / 30) * 0.3 * (1 - waterResistance);
    }
    
    return Math.min(1, stress);
  }

  calculateWindStress(windSpeed, windResistance) {
    if (windSpeed > windResistance) {
      return Math.min(1, (windSpeed - windResistance) / 20);
    }
    return 0;
  }

  calculateSeverity(faultType, environment) {
    let severity = 1;
    
    if (environment.weatherLevel >= 3) severity += 1;
    if (environment.isStorm) severity += 1;
    
    return Math.min(3, severity);
  }

  diagnose(equipment) {
    const faults = equipment.faults || [];
    
    return faults.map(faultType => {
      const info = this.faultTypes[faultType] || { name: faultType };
      
      return {
        type: faultType,
        name: info.name,
        symptoms: this.getSymptoms(faultType),
        repairSteps: this.getRepairSteps(faultType),
        estimatedTime: this.getRepairTime(faultType),
        difficulty: this.getDifficulty(faultType)
      };
    });
  }

  getSymptoms(faultType) {
    const symptoms = {
      power_failure: ['设备无响应', '指示灯不亮', '数据传输停止', '电压读数异常'],
      sensor_drift: ['读数异常波动', '数据偏差超过阈值', '校准失败', '与参考数据不一致'],
      communication_loss: ['信号丢失', '数据传输中断', '远程连接失败', '响应超时'],
      water_damage: ['设备内部潮湿', '电路短路', '性能不稳定', '异常发热'],
      structural_damage: ['外壳变形', '部件松动', '异常噪音', '安装位置偏移'],
      calibration_error: ['读数不准确', '与其他设备数据不一致', '零点漂移', '重复性差'],
      battery_drain: ['电压过低', '频繁重启', '高负载时关机', '充电效率低'],
      signal_interference: ['数据丢包率高', '信号强度波动', '连接不稳定', '误码率上升']
    };
    return symptoms[faultType] || ['设备运行异常'];
  }

  getRepairSteps(faultType) {
    const steps = {
      power_failure: [
        '检查电源连接线是否松动',
        '使用万用表测量电池电压',
        '断开故障模块电源',
        '更换备用电池模块',
        '重新启动设备并验证'
      ],
      sensor_drift: [
        '进入传感器校准模式',
        '检查传感器表面是否清洁',
        '使用标准样本进行多点校准',
        '调整温度补偿参数',
        '连续采样验证读数稳定性'
      ],
      communication_loss: [
        '检查天线馈线连接',
        '测量信号接收强度',
        '重置通信模块固件',
        '尝试切换备用通信频率',
        '发送测试数据包验证连接'
      ],
      water_damage: [
        '立即断开设备电源防止短路',
        '打开设备外壳进行检查',
        '使用干燥剂或低温烘干',
        '检查电路板是否有腐蚀',
        '更换受损电子元件'
      ],
      structural_damage: [
        '进行全面结构外观检查',
        '标记松动或损坏的部件',
        '使用专用工具紧固连接',
        '更换损坏的外壳或支架',
        '重新校准安装水平度'
      ],
      calibration_error: [
        '确认当前校准参数',
        '准备标准校准设备',
        '执行零点和量程校准',
        '保存新的校准系数',
        '执行校准验证测试'
      ],
      battery_drain: [
        '检查电池当前电压容量',
        '检查太阳能板表面清洁度',
        '测量充电电路电流',
        '断开非必要负载模块',
        '更换老化电池组'
      ],
      signal_interference: [
        '使用频谱仪检测干扰源',
        '调整天线朝向和极化',
        '安装信号滤波装置',
        '优化发射功率参数',
        '采用跳频通信模式'
      ]
    };
    return steps[faultType] || ['执行常规维护', '检查设备状态'];
  }

  getRepairTime(faultType) {
    const times = {
      power_failure: 25,
      sensor_drift: 50,
      communication_loss: 30,
      water_damage: 120,
      structural_damage: 75,
      calibration_error: 40,
      battery_drain: 20,
      signal_interference: 45
    };
    return times[faultType] || 30;
  }

  getDifficulty(faultType) {
    const difficulties = {
      power_failure: '简单',
      sensor_drift: '中等',
      communication_loss: '简单',
      water_damage: '困难',
      structural_damage: '中等',
      calibration_error: '中等',
      battery_drain: '简单',
      signal_interference: '中等'
    };
    return difficulties[faultType] || '中等';
  }
}

module.exports = FaultDetector;
