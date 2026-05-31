import { Router, Request, Response } from 'express';
import { clusterService } from '../services/ClusterService.js';
import { Severity, AnomalyAlert } from '../../shared/types.js';

const router = Router();

router.get('/clusters', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const clusters = clusterService.getClusters(limit);

    res.status(200).json({
      success: true,
      data: clusters,
      total: clusters.length
    });
  } catch (error) {
    console.error('Error getting clusters:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/alerts', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const level = req.query.level as Severity | undefined;
    const status = req.query.status as AnomalyAlert['status'] | undefined;

    const alerts = clusterService.getAlerts(limit, level, status);

    res.status(200).json({
      success: true,
      data: alerts,
      total: alerts.length
    });
  } catch (error) {
    console.error('Error getting alerts:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.put('/alerts/:id/status', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'processing', 'resolved', 'ignored'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: pending, processing, resolved, ignored'
      });
    }

    const updated = clusterService.updateAlertStatus(id, status);

    if (updated) {
      res.status(200).json({
        success: true,
        message: 'Alert status updated successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }
  } catch (error) {
    console.error('Error updating alert status:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/stats', (req: Request, res: Response) => {
  try {
    const stats = clusterService.getAlertStats();
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting alert stats:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/analyze', (req: Request, res: Response) => {
  try {
    const clusters = clusterService.runPeriodicClustering();
    const alertsCreated = clusters.reduce((sum, c) => sum + Math.min(c.pointCount, 5), 0);
    res.status(200).json({
      success: true,
      data: {
        clusters,
        alertsCreated
      },
      total: clusters.length
    });
  } catch (error) {
    console.error('Error running clustering analysis:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
