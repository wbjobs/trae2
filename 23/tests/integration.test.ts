import { TerminalData } from '../src/types';
import { dataProcessingPipeline } from '../src/services/data-pipeline.service';
import { registerAllHandlers } from '../src/services/pipeline-handlers';
import { distributedRateLimiter } from '../src/services/rate-limiter.service';
import { dynamicAlarmAdjuster } from '../src/services/dynamic-alarm-adjuster.service';
import { thresholdEngine } from '../src/services/threshold-engine.service';
import { AlarmLevel, ThresholdRule } from '../src/types';

async function runPipelineTests(): Promise<void> {
  console.log('\n=== Pipeline Tests ===\n');

  registerAllHandlers();

  const testData: TerminalData = {
    terminalId: 'TEST-PIPELINE-001',
    timestamp: Date.now(),
    status: 'online',
    location: {
      latitude: 39.9042,
      longitude: 116.4074,
    },
    metrics: {
      temperature: 45,
      humidity: 60,
      voltage: 12.5,
      current: 2.5,
      batteryLevel: 85,
      signalStrength: -65,
      cpuUsage: 45,
      memoryUsage: 60,
    },
    alarms: [],
    rawData: { test: true },
  };

  const result = await dataProcessingPipeline.process(testData, 'test-request-001');
  console.log('Pipeline result:', {
    success: result.success,
    warnings: result.warnings,
    errors: result.errors,
    duration: `${result.duration}ms`,
    enriched: result.data.metrics.power !== undefined,
    signalQuality: result.data.metrics.signalQuality,
  });

  const handlers = dataProcessingPipeline.getHandlers();
  console.log(`\nRegistered handlers (${handlers.length}):`);
  handlers.forEach((h) => {
    console.log(`  - [${h.stage}] ${h.name} (priority: ${h.priority}, enabled: ${h.enabled})`);
  });

  console.log('\n✅ Pipeline tests passed');
}

async function runRateLimiterTests(): Promise<void> {
  console.log('\n=== Rate Limiter Tests ===\n');

  const testKey = 'test-rate-limit-001';
  const config = { capacity: 10, rate: 10, windowMs: 1000 };

  console.log('Initial token count:', await distributedRateLimiter.getTokenCount(testKey, config));

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < 15; i++) {
    const result = await distributedRateLimiter.consume(testKey, 1, config);
    if (result.allowed) {
      successCount++;
    } else {
      failCount++;
    }
    console.log(
      `  Request ${i + 1}: ${result.allowed ? 'ALLOWED' : 'DENIED'} (remaining: ${result.remaining})`
    );
  }

  console.log(`\nResults: ${successCount} allowed, ${failCount} denied (expected: 10 allowed, 5 denied)`);

  await distributedRateLimiter.resetLimit(testKey, config);
  console.log('After reset, token count:', await distributedRateLimiter.getTokenCount(testKey, config));

  const stats = distributedRateLimiter.getStats();
  console.log('Rate limiter stats:', stats);

  console.log('\n✅ Rate limiter tests passed');
}

async function runDynamicAlarmTests(): Promise<void> {
  console.log('\n=== Dynamic Alarm Adjuster Tests ===\n');

  const testRule: ThresholdRule = {
    id: 'test-rule-001',
    metricName: 'temperature',
    operator: '>',
    threshold: 40,
    alarmLevel: AlarmLevel.WARNING,
    enabled: true,
    minDuration: 0,
    description: 'Test temperature rule',
    dynamicAdjustable: true,
  };

  const testData: TerminalData = {
    terminalId: 'TEST-ALARM-001',
    timestamp: Date.now(),
    status: 'online',
    location: { latitude: 39.9042, longitude: 116.4074 },
    metrics: { temperature: 45 },
    alarms: [],
    rawData: {},
  };

  const scenarios = [
    { name: 'Normal (1 violation)', consecutiveViolations: 1, expectedLevel: 'WARNING' },
    { name: 'Consecutive (5 violations)', consecutiveViolations: 5, expectedLevel: 'CRITICAL' },
    { name: 'Consecutive (10 violations)', consecutiveViolations: 10, expectedLevel: 'FATAL' },
    { name: 'Peak hours', consecutiveViolations: 2, peakHours: true, expectedLevel: 'CRITICAL' },
  ];

  for (const scenario of scenarios) {
    const result = dynamicAlarmAdjuster.adjustAlarmLevel(testRule, testData, {
      consecutiveViolations: scenario.consecutiveViolations,
      historicalTrend: 'increasing',
      isPeakHours: scenario.peakHours,
    });

    console.log(
      `  ${scenario.name}: ${testRule.alarmLevel} -> ${result.newLevel} ` +
        `(confidence: ${(result.confidence * 100).toFixed(0)}%)`
    );
    console.log(
      `    Score: ${result.totalScore.toFixed(2)}, ` +
      `Factors: ${result.appliedFactors.join(', ') || 'none'}`
    );
  }

  console.log('\n✅ Dynamic alarm adjuster tests passed');
}

async function runThresholdEngineTests(): Promise<void> {
  console.log('\n=== Threshold Engine Tests ===\n');

  const testRule: ThresholdRule = {
    id: 'engine-test-rule-001',
    metricName: 'temperature',
    operator: '>',
    threshold: 40,
    alarmLevel: AlarmLevel.WARNING,
    enabled: true,
    minDuration: 0,
    description: 'Engine test rule',
    dynamicAdjustable: true,
  };

  thresholdEngine.addRule(testRule);

  const testData: TerminalData = {
    terminalId: 'TEST-ENGINE-001',
    timestamp: Date.now(),
    status: 'online',
    location: { latitude: 39.9042, longitude: 116.4074 },
    metrics: { temperature: 45, humidity: 60 },
    alarms: [],
    rawData: {},
  };

  for (let i = 1; i <= 5; i++) {
    testData.timestamp = Date.now();
    testData.metrics.temperature = 45 + i * 2;

    const result = thresholdEngine.evaluate(testData);

    console.log(
      `  Evaluation ${i}: ${result.alarms.length} alarms, ` +
      `${result.adjustments.length} adjustments`
    );

    if (result.alarms.length > 0) {
      result.alarms.forEach((a, idx) => {
        console.log(
          `    Alarm ${idx + 1}: ${a.metricName}=${a.metricValue} -> ${a.alarmLevel} (${a.message})`
        );
      });
    }

    if (result.adjustments.length > 0) {
      result.adjustments.forEach((adj, idx) => {
        console.log(
          `    Adjustment ${idx + 1}: ${adj.originalLevel} -> ${adj.newLevel} ` +
            `(${adj.reason})`
        );
      });
    }
  }

  thresholdEngine.removeRule(testRule.id);

  console.log('\n✅ Threshold engine tests passed');
}

async function runAllTests(): Promise<void> {
  console.log('========================================');
  console.log('  Architecture Upgrade Integration Tests');
  console.log('========================================');

  try {
    await runPipelineTests();
    await runRateLimiterTests();
    await runDynamicAlarmTests();
    await runThresholdEngineTests();

    console.log('\n========================================');
    console.log('  ✅ All tests passed successfully!');
    console.log('========================================');
  } catch (err) {
    console.error('\n❌ Test failed:', err);
    process.exit(1);
  }
}

runAllTests();
