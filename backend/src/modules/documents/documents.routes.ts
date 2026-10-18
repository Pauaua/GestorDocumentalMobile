import { Router, type Request } from 'express';
import { z } from 'zod';
import { authenticate, currentUser, requireRole } from '../../middleware/auth';
import { parse } from '../../middleware/validate';
import { ADMIN_ROLES, MANAGEMENT_ROLES, UPLOADER_ROLES } from '../auth/roles';
import {
  createDocumentSchema,
  downloadUrlSchema,
  listDocumentsSchema,
  updateDocumentSchema,
  uploadUrlSchema,
} from './documents.schemas';
import * as service from './documents.service';

const idParam = z.object({ id: z.uuid('Identificador inválido') });

const requestContext = (req: Request): service.RequestContext => ({ ip: req.ip, userAgent: req.get('user-agent') });

export function documentsRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.get('/', async (req, res) => {
    res.json(await service.listDocuments(currentUser(req), parse(listDocumentsSchema, req.query)));
  });

  router.get('/stats', requireRole(...MANAGEMENT_ROLES), async (req, res) => {
    res.json(await service.getStats(currentUser(req)));
  });

  router.post('/upload-url', requireRole(...UPLOADER_ROLES), async (req, res) => {
    res.status(201).json(await service.createUploadUrl(currentUser(req), parse(uploadUrlSchema, req.body)));
  });

  router.post('/', requireRole(...UPLOADER_ROLES), async (req, res) => {
    res.status(201).json(await service.createDocument(currentUser(req), parse(createDocumentSchema, req.body), requestContext(req)));
  });

  router.get('/:id', async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json(await service.getDocument(currentUser(req), id, requestContext(req)));
  });

  router.patch('/:id', requireRole(...UPLOADER_ROLES), async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json(await service.updateDocument(currentUser(req), id, parse(updateDocumentSchema, req.body), requestContext(req)));
  });

  router.delete('/:id', requireRole(...ADMIN_ROLES), async (req, res) => {
    const { id } = parse(idParam, req.params);
    await service.deleteDocument(currentUser(req), id, requestContext(req));
    res.status(204).end();
  });

  router.get('/:id/download-url', async (req, res) => {
    const { id } = parse(idParam, req.params);
    const { disposition } = parse(downloadUrlSchema, req.query);
    res.json(await service.createDownloadUrl(currentUser(req), id, disposition, requestContext(req)));
  });

  router.post('/:id/acknowledge', async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json(await service.acknowledgeDocument(currentUser(req), id, requestContext(req)));
  });

  router.get('/:id/receipts', requireRole(...MANAGEMENT_ROLES), async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json(await service.listReceipts(currentUser(req), id));
  });

  router.get('/:id/downloads', requireRole(...MANAGEMENT_ROLES), async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json(await service.listDownloads(currentUser(req), id));
  });

  return router;
}
