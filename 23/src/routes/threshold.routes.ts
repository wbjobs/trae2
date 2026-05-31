import { Router } from 'express';
import { ThresholdController } from '../controllers/threshold.controller';

const router = Router();
const thresholdController = new ThresholdController();

router.post('/', thresholdController.create.bind(thresholdController));
router.get('/', thresholdController.list.bind(thresholdController));
router.get('/:ruleId', thresholdController.get.bind(thresholdController));
router.put('/:ruleId', thresholdController.update.bind(thresholdController));
router.delete('/:ruleId', thresholdController.delete.bind(thresholdController));

export default router;
