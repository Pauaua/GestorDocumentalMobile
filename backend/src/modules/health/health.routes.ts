import { Router } from 'express';
import { getInstanceInfo } from '../../lib/instance';
import { getPrisma } from '../../lib/prisma';

const startedAt = Date.now();

/**
 * Health check del ALB. Responde 200 solo si la base de datos contesta;
 * incluye el id de la instancia EC2 para seguir el balanceo en la prueba de falla.
 */
export function healthRouter(): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    const instance = await getInstanceInfo();
    const started = Date.now();
    let database: 'ok' | 'error' = 'ok';
    try {
      await getPrisma().$queryRaw`SELECT 1`;
    } catch {
      database = 'error';
    }
    res.set('Cache-Control', 'no-store');
    res.status(database === 'ok' ? 200 : 503).json({
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      dbLatencyMs: Date.now() - started,
      instanceId: instance.instanceId,
      availabilityZone: instance.availabilityZone,
      version: process.env.APP_VERSION ?? 'dev',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    });
  });
  return router;
}
