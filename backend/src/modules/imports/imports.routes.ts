import express, { Router } from 'express';
import { z } from 'zod';
import { badRequest } from '../../lib/errors';
import { authenticate, currentUser, requireRole } from '../../middleware/auth';
import { activeSchool } from '../../middleware/tenant';
import { parse } from '../../middleware/validate';
import { ADMIN_ROLES } from '../auth/roles';
import { importPeople, importStudents, TEMPLATES, type ImportKind } from './imports.service';

const optionsSchema = z.object({
  // Por defecto solo vista previa: hay que confirmar explícitamente con dryRun=false.
  dryRun: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  invite: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
});

const kindParam = z.object({ kind: z.enum(['people', 'students']) });

/**
 * Importación masiva desde CSV (Excel → "Guardar como CSV"). El cuerpo es el CSV (text/csv, hasta 2 MB):
 *   POST /imports/people?dryRun=true    → vista previa fila por fila
 *   POST /imports/people?dryRun=false   → importa (todo o nada)
 *   GET  /imports/people/template       → plantilla con los encabezados
 */
export function importsRouter(): Router {
  const router = Router();
  router.use(authenticate, requireRole(...ADMIN_ROLES));

  router.get('/:kind/template', (req, res) => {
    const { kind } = parse(kindParam, req.params);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.attachment(`plantilla-${kind === 'people' ? 'personas' : 'estudiantes'}.csv`);
    // BOM para que Excel reconozca UTF-8 (tildes y ñ).
    res.send(`﻿${TEMPLATES[kind].join(';')}\n`);
  });

  router.post('/:kind', express.text({ type: ['text/csv', 'text/plain'], limit: '2mb' }), async (req, res) => {
    const { kind } = parse(kindParam, req.params) as { kind: ImportKind };
    const opts = parse(optionsSchema, req.query);
    if (typeof req.body !== 'string' || req.body.trim() === '') throw badRequest('Envía el archivo CSV (Content-Type: text/csv)');
    const run = kind === 'people' ? importPeople : importStudents;
    const result = await run(currentUser(req), activeSchool(req), req.body, { ...opts, ip: req.ip });
    res.status(result.dryRun ? 200 : 201).json(result);
  });

  return router;
}
