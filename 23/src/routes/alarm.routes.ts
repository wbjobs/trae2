import { Router } from 'express';
import { AlarmController } from '../controllers/alarm.controller';

const router = Router();
const alarmController = new AlarmController();

router.get('/', alarmController.listAlarms.bind(alarmController));
router.get('/:alarmId', alarmController.getAlarm.bind(alarmController));
router.put('/:alarmId/acknowledge', alarmController.acknowledge.bind(alarmController));
router.put('/:alarmId/resolve', alarmController.resolve.bind(alarmController));
router.get('/stats/summary', alarmController.getStats.bind(alarmController));

export default router;
