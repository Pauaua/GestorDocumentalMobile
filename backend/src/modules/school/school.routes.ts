import { Router } from 'express';
import { activeSchool } from '../../middleware/tenant';

/** Datos públicos del colegio de la solicitud (nombre y color para la pantalla de inicio de sesión). */
export function schoolRouter(): Router {
  const router = Router();
  router.get('/', (req, res) => {
    const { slug, name, primaryColor } = activeSchool(req);
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ slug, name, primaryColor });
  });
  return router;
}
