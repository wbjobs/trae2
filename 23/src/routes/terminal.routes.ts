import { Router } from 'express';
import { TerminalController } from '../controllers/terminal.controller';
import { validateTerminalData } from '../middleware/validation.middleware';
import { distributedLock } from '../middleware/lock.middleware';

const router = Router();
const terminalController = new TerminalController();

router.post(
  '/report',
  validateTerminalData,
  distributedLock('terminal:report', 'terminalId', 5000),
  terminalController.reportData.bind(terminalController)
);

router.get('/:terminalId/status', terminalController.getStatus.bind(terminalController));
router.get('/:terminalId/history', terminalController.getHistory.bind(terminalController));
router.get('/:terminalId/alarms', terminalController.getAlarms.bind(terminalController));
router.get('/list', terminalController.listTerminals.bind(terminalController));

export default router;
