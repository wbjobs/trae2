import Router from 'koa-router';
import QueryController from '../controllers/QueryController';
import AlertController from '../controllers/AlertController';

const router = new Router({ prefix: '/api/query' });
const queryController = new QueryController();

router.post('/trace', queryController.queryTrace.bind(queryController));
router.get('/signaling/:id', queryController.getSignalingById.bind(queryController));
router.get('/metrics', queryController.getMetrics.bind(queryController));
router.get('/realtime', queryController.getRealtime.bind(queryController));
router.post('/search', queryController.searchPayload.bind(queryController));
router.get('/devices', queryController.getDevices.bind(queryController));
router.get('/types', queryController.getTypes.bind(queryController));
router.get('/health', queryController.healthCheck.bind(queryController));

const alertRouter = new Router({ prefix: '/api/alerts' });
const alertController = new AlertController();

alertRouter.get('/', alertController.getAlerts.bind(alertController));
alertRouter.get('/stats', alertController.getStats.bind(alertController));
alertRouter.post('/:id/acknowledge', alertController.acknowledgeAlert.bind(alertController));
alertRouter.get('/rules', alertController.getRules.bind(alertController));
alertRouter.post('/rules', alertController.createRule.bind(alertController));
alertRouter.put('/rules/:id', alertController.updateRule.bind(alertController));
alertRouter.delete('/rules/:id', alertController.deleteRule.bind(alertController));
alertRouter.post('/rules/:id/enable', alertController.enableRule.bind(alertController));
alertRouter.post('/rules/:id/disable', alertController.disableRule.bind(alertController));

router.use(alertRouter.routes());
router.use(alertRouter.allowedMethods());

export default router;
