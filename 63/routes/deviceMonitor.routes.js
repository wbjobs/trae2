const express = require('express');
const router = express.Router();
const apiResponse = require('../utils/response');
const deviceMonitorService = require('../services/deviceMonitor.service');
const alertPolicyService = require('../services/alertPolicy.service');
const { validateDeviceId } = require('../validators/corrosion.validator');

router.get('/device/:deviceId/status', async (req, res, next) => {
  try {
    const { deviceId } = req.params;

    if (!validateDeviceId(deviceId)) {
      return apiResponse.badRequest(res, 'Invalid device ID format');
    }

    const status = await deviceMonitorService.getDeviceOnlineStatus(deviceId);
    return apiResponse.success(res, status);
  } catch (err) {
    next(err);
  }
});

router.post('/device/batch-status', async (req, res, next) => {
  try {
    const { deviceIds } = req.body;

    if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
      return apiResponse.badRequest(res, 'deviceIds must be a non-empty array');
    }

    if (deviceIds.length > 100) {
      return apiResponse.badRequest(res, 'Maximum 100 devices per batch request');
    }

    const statuses = await deviceMonitorService.batchCheckDevices(deviceIds);
    return apiResponse.success(res, {
      count: statuses.length,
      devices: statuses
    });
  } catch (err) {
    next(err);
  }
});

router.get('/devices/offline', async (req, res, next) => {
  try {
    const offlineDevices = await deviceMonitorService.getOfflineDevices();
    return apiResponse.success(res, offlineDevices);
  } catch (err) {
    next(err);
  }
});

router.get('/devices/statistics', async (req, res, next) => {
  try {
    const stats = await deviceMonitorService.getDeviceStatistics();
    return apiResponse.success(res, stats);
  } catch (err) {
    next(err);
  }
});

router.get('/policy/current', async (req, res, next) => {
  try {
    const currentPolicy = alertPolicyService.getCurrentPolicy();
    return apiResponse.success(res, currentPolicy);
  } catch (err) {
    next(err);
  }
});

router.get('/policy/all', async (req, res, next) => {
  try {
    const policies = alertPolicyService.getAllPolicies();
    return apiResponse.success(res, { policies });
  } catch (err) {
    next(err);
  }
});

router.post('/policy/switch', async (req, res, next) => {
  try {
    const { policy, manualOverride } = req.body;

    if (!policy) {
      return apiResponse.badRequest(res, 'Policy name is required');
    }

    if (manualOverride) {
      await alertPolicyService.setManualOverride(true, policy);
    } else {
      await alertPolicyService.switchPolicy(policy, 'api_request');
    }

    return apiResponse.success(res, alertPolicyService.getCurrentPolicy(), 'Policy switched successfully');
  } catch (err) {
    next(err);
  }
});

router.post('/policy/override', async (req, res, next) => {
  try {
    const { enabled, policy } = req.body;

    const result = await alertPolicyService.setManualOverride(enabled, policy);
    return apiResponse.success(res, result, enabled ? 'Manual override enabled' : 'Manual override disabled');
  } catch (err) {
    next(err);
  }
});

router.get('/policy/schedule', async (req, res, next) => {
  try {
    const schedule = alertPolicyService.getSchedule();
    return apiResponse.success(res, { schedule });
  } catch (err) {
    next(err);
  }
});

router.put('/policy/schedule', async (req, res, next) => {
  try {
    const { schedule } = req.body;

    if (!Array.isArray(schedule)) {
      return apiResponse.badRequest(res, 'Schedule must be an array');
    }

    const result = await alertPolicyService.updateSchedule(schedule);
    return apiResponse.success(res, result, 'Schedule updated successfully');
  } catch (err) {
    next(err);
  }
});

router.post('/policy/schedule', async (req, res, next) => {
  try {
    const rule = await alertPolicyService.addScheduleRule(req.body);
    return apiResponse.success(res, rule, 'Schedule rule added successfully');
  } catch (err) {
    next(err);
  }
});

router.delete('/policy/schedule/:ruleId', async (req, res, next) => {
  try {
    const { ruleId } = req.params;
    const result = await alertPolicyService.removeScheduleRule(ruleId);

    if (!result.success) {
      return apiResponse.notFound(res, result.message);
    }

    return apiResponse.success(res, null, 'Schedule rule removed successfully');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
