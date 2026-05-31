export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class QueueError extends AppError {
  constructor(message: string) {
    super(message, 503, 'QUEUE_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, 'NOT_FOUND');
  }
}

export class DataIngestionError extends Error {
  public readonly code: string;
  public readonly cause?: Error;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    cause?: Error,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DataIngestionError';
    this.code = code;
    this.cause = cause;
    this.context = context;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      stack: this.stack
    };
  }
}

export class RabbitMQConnectionError extends DataIngestionError {
  constructor(message: string, cause?: Error, context?: Record<string, unknown>) {
    super(message, 'RABBITMQ_CONNECTION_ERROR', cause, context);
    this.name = 'RabbitMQConnectionError';
  }
}

export class ClickHouseConnectionError extends DataIngestionError {
  constructor(message: string, cause?: Error, context?: Record<string, unknown>) {
    super(message, 'CLICKHOUSE_CONNECTION_ERROR', cause, context);
    this.name = 'ClickHouseConnectionError';
  }
}

export class MessageProcessingError extends DataIngestionError {
  constructor(message: string, cause?: Error, context?: Record<string, unknown>) {
    super(message, 'MESSAGE_PROCESSING_ERROR', cause, context);
    this.name = 'MessageProcessingError';
  }
}

export class BatchInsertError extends DataIngestionError {
  constructor(message: string, cause?: Error, context?: Record<string, unknown>) {
    super(message, 'BATCH_INSERT_ERROR', cause, context);
    this.name = 'BatchInsertError';
  }
}
