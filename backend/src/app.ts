import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { AppConfig } from './config/env';
import { getLogger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/error';
import { resolveTenant } from './middleware/tenant';
import { auditRouter } from './modules/audit/audit.routes';
import { authRouter } from './modules/auth/auth.routes';
import { coursesRouter } from './modules/courses/courses.routes';
import { documentTypesRouter } from './modules/document-types/document-types.routes';
import { documentsRouter } from './modules/documents/documents.routes';
import { healthRouter } from './modules/health/health.routes';
import { importsRouter } from './modules/imports/imports.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { platformRouter } from './modules/platform/platform.routes';
import { privacyRouter } from './modules/privacy/privacy.routes';
import { schoolRouter } from './modules/school/school.routes';
import { usersRouter } from './modules/users/users.routes';

export function createApp(config: AppConfig): Express {
  const app = express();
  // Un salto de proxy: el ALB. Así req.ip y req.secure usan X-Forwarded-*.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  const s3Origins = ['https://*.amazonaws.com', ...(config.S3_PUBLIC_ENDPOINT ? [config.S3_PUBLIC_ENDPOINT] : [])];
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // react-native-web inyecta estilos en línea.
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:', ...s3Origins],
          // Subidas y descargas directas a S3 con presigned URL.
          connectSrc: ["'self'", ...s3Origins],
          frameSrc: ["'self'", 'blob:', ...s3Origins],
          objectSrc: ["'none'"],
          // Sin dominio el ALB puede quedar solo en HTTP: no forzar upgrade.
          upgradeInsecureRequests: null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: config.CORS_ORIGINS.length > 0 ? config.CORS_ORIGINS : false,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  if (config.NODE_ENV !== 'test') {
    app.use(
      pinoHttp({
        logger: getLogger(),
        autoLogging: { ignore: (req) => req.url === '/health' },
        serializers: {
          req: (req: { id: unknown; method: string; url: string; remoteAddress?: string }) => ({
            id: req.id,
            method: req.method,
            url: req.url,
            remoteAddress: req.remoteAddress,
          }),
          res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        },
        customProps: (req) => ({ userId: req.user?.id, role: req.user?.role }),
        customLogLevel: (_req, res, err) => {
          if (err || res.statusCode >= 500) return 'error';
          return res.statusCode >= 400 ? 'warn' : 'info';
        },
      }),
    );
  }

  app.use('/health', healthRouter());

  const api = express.Router();
  api.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: config.RATE_LIMIT_MAX,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas solicitudes, intenta nuevamente.' } },
    }),
  );
  // Colegio (tenant) de la solicitud: subdominio, header X-School o DEFAULT_SCHOOL_SLUG.
  api.use(resolveTenant);
  api.use('/school', schoolRouter());
  api.use('/auth', authRouter());
  api.use('/platform', platformRouter());
  api.use('/documents', documentsRouter());
  api.use('/document-types', documentTypesRouter());
  api.use('/users', usersRouter());
  api.use('/notifications', notificationsRouter());
  api.use('/courses', coursesRouter());
  api.use('/imports', importsRouter());
  api.use('/audit', auditRouter());
  api.use('/privacy', privacyRouter());
  api.use(notFoundHandler);
  app.use('/api/v1', api);

  // Versión web de la app (npx expo export -p web), servida desde la misma instancia EC2.
  if (config.WEB_DIST_DIR && fs.existsSync(config.WEB_DIST_DIR)) {
    const webDir = path.resolve(config.WEB_DIST_DIR);
    app.use(express.static(webDir, { index: false, maxAge: '1h' }));
    // Fallback SPA: cualquier ruta que no sea de la API entrega index.html (Expo Router resuelve en el cliente).
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(webDir, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
