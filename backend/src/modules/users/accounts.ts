import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { conflict } from '../../lib/errors';
import { isValidRut, normalizeRut } from '../../lib/rut';
import { hashPassword } from '../auth/auth.service';

export const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(100)
  .regex(/[A-Za-z]/, 'Debe incluir letras')
  .regex(/\d/, 'Debe incluir números');

export const rutSchema = z
  .string()
  .transform(normalizeRut)
  .refine(isValidRut, 'RUT inválido');

export const accountSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  rut: rutSchema,
  email: z.email('Correo inválido').transform((v) => v.toLowerCase().trim()),
  /** Sin contraseña la persona recibe una invitación por correo para crearla. */
  password: passwordSchema.optional(),
  phone: z.string().trim().max(20).optional().nullable(),
});

export type AccountInput = z.infer<typeof accountSchema>;

/**
 * Devuelve la cuenta RTLCO de la persona o la crea.
 * Una cuenta existente se reutiliza solo si coinciden correo y RUT; su contraseña y datos no se tocan,
 * porque puede pertenecer a otros colegios.
 * needsInvitation: cuenta nueva sin contraseña (se crea con una clave aleatoria que nadie conoce).
 * placeholderHash: hash a reutilizar para esas cuentas en una importación masiva (bcrypt cuesta ~250 ms
 * por cuenta); es el hash de un secreto aleatorio descartado, igual de imposible de adivinar.
 */
export async function findOrCreateAccount(
  tx: Prisma.TransactionClient,
  input: AccountInput,
  options: { placeholderHash?: string } = {},
): Promise<{ userId: string; existingAccount: boolean; needsInvitation: boolean }> {
  const matches = await tx.user.findMany({
    where: { OR: [{ email: input.email }, { rut: input.rut }] },
    select: { id: true, email: true, rut: true },
  });
  if (matches.length > 0) {
    const existing = matches.find((u) => u.email === input.email && u.rut === input.rut);
    if (!existing || matches.length > 1) throw conflict('El correo o el RUT ya pertenecen a otra cuenta');
    return { userId: existing.id, existingAccount: true, needsInvitation: false };
  }
  const user = await tx.user.create({
    data: {
      fullName: input.fullName,
      rut: input.rut,
      email: input.email,
      phone: input.phone ?? null,
      passwordHash: input.password
        ? await hashPassword(input.password)
        : (options.placeholderHash ?? (await randomPasswordHash())),
    },
    select: { id: true },
  });
  return { userId: user.id, existingAccount: false, needsInvitation: !input.password };
}

/** Hash de una contraseña aleatoria que nadie conoce (la persona la crea con su invitación). */
export function randomPasswordHash(): Promise<string> {
  return hashPassword(crypto.randomBytes(32).toString('base64url'));
}
