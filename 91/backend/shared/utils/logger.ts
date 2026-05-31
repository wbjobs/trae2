import winston from 'winston';

export function createLogger(serviceName: string, level: string = 'info'): winston.Logger {
  return winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DDTHH:mm:ss.SSSZ'
      }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { service: serviceName },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf((info) => {
            const { timestamp, level, message, service, ...rest } = info as winston.Logform.TransformableInfo & { service: string };
            const meta = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
            return `${timestamp} [${service}] ${level}: ${message}${meta}`;
          })
        )
      })
    ]
  });
}

export type Logger = winston.Logger;
