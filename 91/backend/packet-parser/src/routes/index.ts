import Router from 'koa-router';
import captureController from '../controllers/CaptureController';

const router = new Router({ prefix: '/api/capture' });

router.get('/start', captureController.startCapture.bind(captureController));
router.get('/stop', captureController.stopCapture.bind(captureController));
router.get('/status', captureController.getStatus.bind(captureController));
router.post('/parse', captureController.parsePackets.bind(captureController));
router.get('/generate', captureController.generatePackets.bind(captureController));
router.get('/health', captureController.healthCheck.bind(captureController));

export default router;
