import { Router } from 'express';
import * as bridgeController from '../controllers/bridgeController.js';

const router = Router();

router.get('/bridges', bridgeController.getBridges);
router.get('/bridges/:id', bridgeController.getBridge);
router.get('/bridges/:bridgeId/defects', bridgeController.getDefects);
router.get('/bridges/:bridgeId/layers', bridgeController.getLayers);
router.get('/bridges/:bridgeId/stress', bridgeController.getStressResults);

router.post('/defects', bridgeController.createDefect);
router.put('/defects/:id', bridgeController.updateDefect);
router.delete('/defects/:id', bridgeController.deleteDefect);

router.post('/layers', bridgeController.createLayer);
router.put('/layers/:id', bridgeController.updateLayer);

export default router;
