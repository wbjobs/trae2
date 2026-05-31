import { Request, Response, NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { createLogger } from './logger'

const logger = createLogger('trace-propagation')

export interface TracePropagationRequest extends Request {
  traceContext?: {
    traceId: string
    spanId: string
    parentSpanId: string
    startTime: number
  }
}

const TRACE_ID_HEADER = 'x-trace-id'
const SPAN_ID_HEADER = 'x-span-id'
const PARENT_SPAN_ID_HEADER = 'x-parent-span-id'

const generateTraceId = (): string => {
  return `trace-${Date.now()}-${uuidv4().replace(/-/g, '').slice(0, 8)}`
}

const generateSpanId = (): string => {
  return `span-${uuidv4().replace(/-/g, '').slice(0, 12)}`
}

export const tracePropagationMiddleware = (
  req: TracePropagationRequest,
  res: Response,
  next: NextFunction
) => {
  const traceId = req.headers[TRACE_ID_HEADER] as string || generateTraceId()
  const parentSpanId = req.headers[SPAN_ID_HEADER] as string || ''
  const spanId = generateSpanId()

  req.traceContext = {
    traceId,
    spanId,
    parentSpanId,
    startTime: Date.now()
  }

  res.setHeader(TRACE_ID_HEADER, traceId)
  res.setHeader(SPAN_ID_HEADER, spanId)

  logger.debug('Trace context established', {
    traceId,
    spanId,
    parentSpanId,
    path: req.path,
    method: req.method
  })

  next()
}

export const injectTraceHeaders = (
  proxyReq: any,
  req: TracePropagationRequest
): void => {
  if (req.traceContext) {
    proxyReq.setHeader(TRACE_ID_HEADER, req.traceContext.traceId)
    proxyReq.setHeader(SPAN_ID_HEADER, req.traceContext.spanId)
    if (req.traceContext.parentSpanId) {
      proxyReq.setHeader(PARENT_SPAN_ID_HEADER, req.traceContext.parentSpanId)
    }
    logger.debug('Injected trace headers into proxy request', {
      traceId: req.traceContext.traceId,
      spanId: req.traceContext.spanId
    })
  }
}