import fs from 'node:fs';
import path from 'node:path';
import pino, { type Logger } from 'pino';

let logger: Logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

/**
 * Logs JSON con pino. En EC2 se escriben en LOG_FILE
 * (/var/log/gestor-documental/app.log), que CloudWatch Agent envía a CloudWatch Logs.
 */
export function initLogger(options: { level: string; file?: string }): Logger {
  let destination: pino.DestinationStream | undefined;
  if (options.file) {
    fs.mkdirSync(path.dirname(options.file), { recursive: true });
    destination = pino.destination({ dest: options.file, sync: false, mkdir: true });
  }
  logger = pino(
    {
      level: options.level,
      base: { service: 'gestor-documental' },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'password', '*.password'],
    },
    destination,
  );
  return logger;
}

export function getLogger(): Logger {
  return logger;
}
