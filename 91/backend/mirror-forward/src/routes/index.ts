import Router from 'koa-router';
import ForwardController from '../controllers/ForwardController';
import FilterController from '../controllers/FilterController';
import DistributionController from '../controllers/DistributionController';
import { validateRawPacket, validateBatchRequest, validateSource, validateParsedPacketRequest } from '../middleware/validate';

const forwardRouter = new Router({
  prefix: '/api/forward',
});

forwardRouter.post('/raw', validateSource, validateRawPacket, ForwardController.forwardRaw);

forwardRouter.post('/batch', validateSource, validateBatchRequest, ForwardController.forwardBatch);

forwardRouter.post('/parsed', validateSource, validateParsedPacketRequest, ForwardController.forwardParsed);

forwardRouter.get('/health', ForwardController.healthCheck);

forwardRouter.get('/stats', ForwardController.getStats);

const filterRouter = new Router({
  prefix: '/api/filter',
});

filterRouter.get('/rules', FilterController.listRules);
filterRouter.post('/rules', FilterController.createRule);
filterRouter.get('/rules/:id', FilterController.getRule);
filterRouter.put('/rules/:id', FilterController.updateRule);
filterRouter.delete('/rules/:id', FilterController.deleteRule);
filterRouter.post('/rules/:id/enable', FilterController.enableRule);
filterRouter.post('/rules/:id/disable', FilterController.disableRule);

filterRouter.get('/stats', FilterController.getStats);
filterRouter.post('/stats/reset', FilterController.resetStats);

filterRouter.post('/test', FilterController.testMessage);

const distributionRouter = new Router({
  prefix: '/api/distribution',
});

distributionRouter.get('/sources', DistributionController.getSources);
distributionRouter.post('/sources', DistributionController.createSource);
distributionRouter.put('/sources/:id', DistributionController.updateSource);
distributionRouter.delete('/sources/:id', DistributionController.deleteSource);

distributionRouter.get('/rules', DistributionController.getRules);
distributionRouter.post('/rules', DistributionController.createRule);
distributionRouter.put('/rules/:id', DistributionController.updateRule);
distributionRouter.delete('/rules/:id', DistributionController.deleteRule);

distributionRouter.get('/stats', DistributionController.getStats);
distributionRouter.post('/reset', DistributionController.resetStats);

const mainRouter = new Router();
mainRouter.use(forwardRouter.routes());
mainRouter.use(forwardRouter.allowedMethods());
mainRouter.use(filterRouter.routes());
mainRouter.use(filterRouter.allowedMethods());
mainRouter.use(distributionRouter.routes());
mainRouter.use(distributionRouter.allowedMethods());

export default mainRouter;
