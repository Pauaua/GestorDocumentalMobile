import { createApp } from './app';
import { loadConfig } from './config/env';
import { getLogger, initLogger } from './lib/logger';
import { disconnectPrisma, getPrisma } from './lib/prisma';
import { startNotificationWorker } from './modules/notifications/notifications.service';

async function main(): Promise<void> {
  const config = await loadConfig();
  const logger = initLogger({ level: config.LOG_LEVEL, file: config.LOG_FILE });
  await getPrisma().$connect();

  const app = createApp(config);
  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'RTLCO escuchando');
  });
  server.on('error', (err: NodeJS.ErrnoException) => {
    const reason = err.code === 'EADDRINUSE' ? `El puerto ${config.PORT} ya está en uso` : err.message;
    logger.fatal({ err }, reason);
    process.exit(1);
  });
  // Outbox de correos y push: cada instancia procesa lotes con SKIP LOCKED (sin envíos duplicados).
  const stopWorker = config.NOTIFICATIONS_WORKER ? startNotificationWorker() : () => undefined;

  // El ALB mantiene conexiones inactivas 60 s: el keep-alive del servidor debe ser mayor.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Cerrando servidor');
    stopWorker();
    server.close(() => {
      void disconnectPrisma().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 15_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  getLogger().fatal({ err }, 'No se pudo iniciar el servidor');
  process.exit(1);
});
