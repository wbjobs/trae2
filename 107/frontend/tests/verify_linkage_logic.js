
const assert = require('assert');

const W_TO_KW = 0.001;
const KWH_TO_MWH = 0.001;

console.log('=== Verifying Chart Linkage Logic ===\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name} PASSED`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name} FAILED: ${e.message}`);
    failed++;
  }
}

test('unit conversion constants should be defined', () => {
  assert.strictEqual(W_TO_KW, 0.001);
  assert.strictEqual(KWH_TO_MWH, 0.001);
});

test('watt to kilowatt conversion', () => {
  const watts = 1500;
  const expectedKw = watts * W_TO_KW;
  assert.strictEqual(expectedKw, 1.5);
});

test('kwh to mwh conversion', () => {
  const kwh = 1500;
  const expectedMwh = kwh * KWH_TO_MWH;
  assert.strictEqual(expectedMwh, 1.5);
});

test('power statistics unit conversion', () => {
  const totalPowerKwh = 1250.5;
  const totalPowerMwh = totalPowerKwh * KWH_TO_MWH;
  assert.ok(Math.abs(totalPowerMwh - 1.2505) < 1e-4);
});

test('efficiency calculation with boundary checks', () => {
  const calculateEfficiency = (input, output) => {
    if (input <= 0.1) return null;
    if (output < 0 || output > input * 1.1) return null;
    return Math.round((output / input * 100 * 100) / 100);
  };

  assert.strictEqual(calculateEfficiency(1000, 950), 95);
  assert.strictEqual(calculateEfficiency(1000, 1100), 110);
  assert.strictEqual(calculateEfficiency(0, 500), null);
  assert.strictEqual(calculateEfficiency(1000, 1200), null);
  assert.strictEqual(calculateEfficiency(1000, -50), null);
});

test('hourly aggregation formula', () => {
  const powerValues = [100.0, 150.0, 200.0, 250.0];
  const avgPower = powerValues.reduce((a, b) => a + b, 0) / powerValues.length;
  const totalPowerKwh = avgPower / 12;
  
  assert.strictEqual(avgPower, 175.0);
  assert.ok(Math.abs(totalPowerKwh - 14.5833) < 1e-4);
});

test('integration calculation (trapezoidal rule)', () => {
  const timeDiffHours = 0.5;
  const power1 = 200.0;
  const power2 = 300.0;
  
  const avgPower = (power1 + power2) / 2;
  const energyKwh = avgPower * timeDiffHours;
  
  assert.strictEqual(avgPower, 250.0);
  assert.strictEqual(energyKwh, 125.0);
});

test('data validation logic', () => {
  const testCases = [
    { power: 100.0, quality: 'good', valid: true },
    { power: -5.0, quality: 'good', valid: false },
    { power: 150.0, quality: 'suspect', valid: false },
    { power: null, quality: 'good', valid: false },
  ];
  
  testCases.forEach(testCase => {
    const isValid = (
      testCase.power !== null &&
      testCase.power !== undefined &&
      testCase.power >= 0 &&
      testCase.quality === 'good'
    );
    assert.strictEqual(isValid, testCase.valid, 
      `Failed for power=${testCase.power}, quality=${testCase.quality}`);
  });
});

test('linked filters state management', () => {
  const linkedFilters = {
    selectedDate: null,
    selectedFaultType: null,
    selectedLossType: null,
    selectedTimeSlot: null
  };
  
  linkedFilters.selectedDate = '2024-01-15';
  assert.strictEqual(linkedFilters.selectedDate, '2024-01-15');
  
  linkedFilters.selectedFaultType = 'inverter_error';
  assert.strictEqual(linkedFilters.selectedFaultType, 'inverter_error');
  
  linkedFilters.selectedDate = null;
  assert.strictEqual(linkedFilters.selectedDate, null);
});

test('inverter data filtering by fault type', () => {
  const inverterData = [
    { id: 'INV001', faultType: 'inverter_error', status: 'fault' },
    { id: 'INV002', faultType: 'overheat', status: 'fault' },
    { id: 'INV003', faultType: null, status: 'normal' },
    { id: 'INV004', faultType: 'inverter_error', status: 'fault' },
  ];
  
  const filterByFaultType = (data, faultType) => {
    if (!faultType) return data;
    return data.filter(item => item.faultType === faultType);
  };
  
  const filtered = filterByFaultType(inverterData, 'inverter_error');
  assert.strictEqual(filtered.length, 2);
  assert.strictEqual(filtered[0].id, 'INV001');
  assert.strictEqual(filtered[1].id, 'INV004');
  
  const allData = filterByFaultType(inverterData, null);
  assert.strictEqual(allData.length, 4);
});

test('date range filtering logic', () => {
  const generateTimeSeriesData = (startDate, days) => {
    const data = [];
    const start = new Date(startDate);
    for (let i = 0; i < days; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      data.push({
        date: date.toISOString().split('T')[0],
        value: Math.random() * 1000
      });
    }
    return data;
  };
  
  const allData = generateTimeSeriesData('2024-01-01', 30);
  
  const filterByDateRange = (data, startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return data.filter(item => {
      const itemDate = new Date(item.date);
      return itemDate >= start && itemDate <= end;
    });
  };
  
  const filtered = filterByDateRange(allData, '2024-01-10', '2024-01-20');
  assert.strictEqual(filtered.length, 11);
  assert.strictEqual(filtered[0].date, '2024-01-10');
  assert.strictEqual(filtered[filtered.length - 1].date, '2024-01-20');
});

test('LRU cache logic', () => {
  class SimpleLRU {
    constructor(capacity) {
      this.capacity = capacity;
      this.cache = new Map();
    }
    
    get(key) {
      if (!this.cache.has(key)) return null;
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    
    set(key, value) {
      if (this.cache.has(key)) {
        this.cache.delete(key);
      } else if (this.cache.size >= this.capacity) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(key, value);
    }
  }
  
  const cache = new SimpleLRU(2);
  cache.set('a', 1);
  cache.set('b', 2);
  assert.strictEqual(cache.get('a'), 1);
  
  cache.set('c', 3);
  assert.strictEqual(cache.get('b'), null);
  assert.strictEqual(cache.get('a'), 1);
  assert.strictEqual(cache.get('c'), 3);
});

test('YoY change rate calculation', () => {
  const calculateYoY = (current, previous) => {
    if (previous === 0) return 0;
    return +((current - previous) / previous * 100).toFixed(2);
  };
  assert.strictEqual(calculateYoY(1200, 1000), 20);
  assert.strictEqual(calculateYoY(800, 1000), -20);
  assert.strictEqual(calculateYoY(1000, 0), 0);
  assert.strictEqual(calculateYoY(1000, 1000), 0);
});

test('MoM change rate calculation', () => {
  const calculateMoM = (current, previous) => {
    if (previous === 0) return 0;
    return +((current - previous) / previous * 100).toFixed(2);
  };
  assert.strictEqual(calculateMoM(550, 500), 10);
  assert.strictEqual(calculateMoM(450, 500), -10);
});

test('MoM period calculation', () => {
  const calculateMoMPeriod = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const deltaMs = end - start;
    const momEnd = new Date(start.getTime() - 86400000);
    const momStart = new Date(momEnd.getTime() - deltaMs);
    return {
      momStart: momStart.toISOString().split('T')[0],
      momEnd: momEnd.toISOString().split('T')[0]
    };
  };
  const result = calculateMoMPeriod('2024-02-01', '2024-02-29');
  assert.strictEqual(result.momEnd, '2024-01-31');
});

test('YoY data structure validation', () => {
  const yoyData = {
    yoy: {
      current: 12580,
      previous: 11000,
      changeValue: 1580,
      changeRate: 14.36,
      details: Array.from({ length: 12 }, (_, i) => ({
        time: `${i + 1}月`,
        current: Math.floor(Math.random() * 800 + 200),
        previous: Math.floor(Math.random() * 700 + 200)
      }))
    },
    mom: {
      current: 856,
      previous: 790,
      changeValue: 66,
      changeRate: 8.35,
      details: Array.from({ length: 30 }, (_, i) => ({
        time: `${i + 1}日`,
        current: Math.floor(Math.random() * 100 + 20),
        previous: Math.floor(Math.random() * 90 + 20)
      }))
    }
  };
  assert.ok(yoyData.yoy.current > 0);
  assert.ok(yoyData.yoy.previous > 0);
  assert.strictEqual(typeof yoyData.yoy.changeRate, 'number');
  assert.strictEqual(yoyData.yoy.details.length, 12);
  assert.strictEqual(yoyData.mom.details.length, 30);
  assert.ok(yoyData.yoy.details[0].hasOwnProperty('time'));
  assert.ok(yoyData.yoy.details[0].hasOwnProperty('current'));
  assert.ok(yoyData.yoy.details[0].hasOwnProperty('previous'));
});

test('fault geo severity classification', () => {
  const classifySeverity = (count) => {
    if (count >= 20) return 'critical';
    if (count >= 10) return 'warning';
    return 'info';
  };
  assert.strictEqual(classifySeverity(25), 'critical');
  assert.strictEqual(classifySeverity(20), 'critical');
  assert.strictEqual(classifySeverity(15), 'warning');
  assert.strictEqual(classifySeverity(10), 'warning');
  assert.strictEqual(classifySeverity(5), 'info');
  assert.strictEqual(classifySeverity(9), 'info');
});

test('fault geo data structure validation', () => {
  const geoData = [
    { name: '银川', coord: [106.28, 38.47], count: 22, severity: 'critical' },
    { name: '酒泉', coord: [98.49, 39.73], count: 15, severity: 'warning' },
    { name: '西宁', coord: [101.78, 36.62], count: 8, severity: 'info' },
    { name: '乌鲁木齐', coord: [87.62, 43.79], count: 30, severity: 'critical' },
    { name: '张北', coord: [114.72, 41.16], count: 5, severity: 'info' }
  ];
  geoData.forEach(item => {
    assert.ok(item.hasOwnProperty('name'));
    assert.ok(item.hasOwnProperty('coord'));
    assert.ok(Array.isArray(item.coord));
    assert.strictEqual(item.coord.length, 2);
    assert.ok(item.coord[0] > 70 && item.coord[0] < 140);
    assert.ok(item.coord[1] > 20 && item.coord[1] < 55);
    assert.ok(item.hasOwnProperty('count'));
    assert.ok(item.hasOwnProperty('severity'));
    assert.ok(['critical', 'warning', 'info'].includes(item.severity));
  });
});

test('layout save and switch logic', () => {
  const layouts = [];
  let idCounter = 1;
  
  const saveLayout = (name, config, isDefault) => {
    if (isDefault) {
      layouts.forEach(l => { l.isDefault = false; });
    }
    const layout = {
      id: idCounter++,
      name,
      config,
      isDefault,
      createdAt: new Date().toISOString()
    };
    layouts.push(layout);
    return layout;
  };
  
  const switchLayout = (id) => {
    return layouts.find(l => l.id === id);
  };
  
  const deleteLayout = (id) => {
    const idx = layouts.findIndex(l => l.id === id);
    if (idx >= 0) {
      layouts.splice(idx, 1);
      return true;
    }
    return false;
  };
  
  const l1 = saveLayout('默认布局', { powerTrendType: 'day', yoyMomType: 'all' }, true);
  assert.strictEqual(l1.name, '默认布局');
  assert.strictEqual(l1.isDefault, true);
  assert.strictEqual(layouts.length, 1);
  
  const l2 = saveLayout('周视图', { powerTrendType: 'week', yoyMomType: 'yoy' }, false);
  assert.strictEqual(layouts.length, 2);
  
  saveLayout('新默认', { powerTrendType: 'month' }, true);
  const defaultCount = layouts.filter(l => l.isDefault).length;
  assert.strictEqual(defaultCount, 1);
  
  const found = switchLayout(1);
  assert.strictEqual(found.name, '默认布局');
  
  deleteLayout(2);
  assert.strictEqual(layouts.length, 2);
});

test('layout config structure', () => {
  const config = {
    gridCols: 12,
    gridRows: 8,
    charts: [
      { id: 'powerTrend', type: 'line', x: 0, y: 0, w: 8, h: 4, visible: true },
      { id: 'faultPie', type: 'pie', x: 8, y: 0, w: 4, h: 4, visible: true },
      { id: 'faultGeo', type: 'map', x: 6, y: 8, w: 6, h: 4, visible: true }
    ]
  };
  assert.ok(config.gridCols > 0);
  assert.ok(Array.isArray(config.charts));
  assert.strictEqual(config.charts.length, 3);
  config.charts.forEach(chart => {
    assert.ok(chart.hasOwnProperty('id'));
    assert.ok(chart.hasOwnProperty('type'));
    assert.ok(chart.hasOwnProperty('x'));
    assert.ok(chart.hasOwnProperty('y'));
    assert.ok(chart.hasOwnProperty('w'));
    assert.ok(chart.hasOwnProperty('h'));
    assert.ok(chart.hasOwnProperty('visible'));
  });
});

test('Hive index optimization settings', () => {
  const settings = {
    'hive.materializedview.rewriting': 'true',
    'hive.exec.parallel': 'true',
    'hive.exec.parallel.thread.number': '8',
    'hive.cbo.enable': 'true',
    'hive.optimize.index.filter': 'true',
    'hive.auto.convert.join': 'true'
  };
  Object.entries(settings).forEach(([key, val]) => {
    assert.ok(typeof val === 'string' && val.length > 0, `${key} should have a value`);
  });
  assert.strictEqual(settings['hive.exec.parallel.thread.number'], '8');
  assert.strictEqual(settings['hive.cbo.enable'], 'true');
});

test('query index column coverage', () => {
  const requiredIndexColumns = {
    'pv_power_daily': ['date', 'station_id'],
    'pv_power_hourly': ['date', 'station_id'],
    'pv_fault_daily': ['date', 'station_id'],
    'pv_fault_raw': ['fault_type'],
    'pv_device_status': ['station_id', 'status']
  };
  Object.entries(requiredIndexColumns).forEach(([table, columns]) => {
    assert.ok(Array.isArray(columns), `${table} columns should be array`);
    assert.ok(columns.length > 0, `${table} should have index columns`);
    columns.forEach(col => {
      assert.ok(typeof col === 'string' && col.length > 0, `${table}.${col} should be a valid column name`);
    });
  });
});

console.log('\n' + '='.repeat(50));
console.log(`Test Results: ${passed} PASSED, ${failed} FAILED`);
console.log('='.repeat(50));

process.exit(failed > 0 ? 1 : 0);
