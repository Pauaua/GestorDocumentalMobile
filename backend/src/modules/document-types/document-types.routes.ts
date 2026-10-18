import { Router } from 'express';
import { getPrisma } from '../../lib/prisma';
import { authenticate } from '../../middleware/auth';

export function documentTypesRouter(): Router {
  const router = Router();
  router.get('/', authenticate, async (_req, res) => {
    res.json(await getPrisma().documentType.findMany({ orderBy: { id: 'asc' } }));
  });
  return router;
}
