import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../../lib/errors';
import { getPrisma } from '../../lib/prisma';
import { authenticate, currentUser, requireRole } from '../../middleware/auth';
import { parse } from '../../middleware/validate';
import { ADMIN_ROLES, MANAGEMENT_ROLES } from '../auth/roles';

const courseSchema = z.object({ name: z.string().trim().min(1).max(60) });

/** Cursos del colegio: audiencia de documentos (los apoderados de sus estudiantes). */
export function coursesRouter(): Router {
  const router = Router();
  router.use(authenticate, requireRole(...MANAGEMENT_ROLES));

  router.get('/', async (req, res) => {
    const courses = await getPrisma().course.findMany({
      where: { schoolId: currentUser(req).schoolId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, _count: { select: { students: true } } },
    });
    res.json(courses.map(({ _count, ...c }) => ({ ...c, students: _count.students })));
  });

  router.post('/', requireRole(...ADMIN_ROLES), async (req, res) => {
    const { name } = parse(courseSchema, req.body);
    const course = await getPrisma().course.create({
      data: { schoolId: currentUser(req).schoolId, name },
      select: { id: true, name: true },
    });
    res.status(201).json({ ...course, students: 0 });
  });

  // Estudiantes del curso con sus apoderados (para revisar una importación o elegir destinatarios).
  router.get('/:id/students', async (req, res) => {
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const course = await getPrisma().course.findFirst({
      where: { id, schoolId: currentUser(req).schoolId },
      select: {
        id: true,
        name: true,
        students: {
          orderBy: { fullName: 'asc' },
          select: {
            id: true,
            rut: true,
            fullName: true,
            guardians: { select: { relationship: true, guardian: { select: { id: true, fullName: true, email: true } } } },
          },
        },
      },
    });
    if (!course) throw notFound('Curso no encontrado');
    res.json(course);
  });

  return router;
}
