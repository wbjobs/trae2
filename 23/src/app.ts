import express from 'express';
import bodyParser from 'body-parser';
import router from './routes';
import { metricsMiddleware } from './middleware/metrics.middleware';
import { requestIdMiddleware } from './middleware/request-id.middleware';
import { errorHandlerMiddleware } from './middleware/error-handler.middleware';
import { responseExtensionMiddleware } from './middleware/response-extension.middleware';

export function createApp(): express.Express {
  const app = express();

  app.use(requestIdMiddleware);
  app.use(responseExtensionMiddleware);
  app.use(metricsMiddleware);
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ extended: true }));

  app.use('/api', router);
  app.use(errorHandlerMiddleware);

  return app;
}

export { router };
