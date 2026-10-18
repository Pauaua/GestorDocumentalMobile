import { AccountTokenPurpose } from '@prisma/client';
import { recordAudit } from '../../lib/audit';
import { getPrisma } from '../../lib/prisma';
import type { Tenant } from '../../middleware/tenant';
import { consumeAccountToken, sendPasswordReset } from './account-tokens';
import { hashPassword } from './auth.service';
import { resolveSchoolRole } from './school-access';

/**
 * Pide un enlace de recuperación. Responde igual exista o no la cuenta (sin enumeración):
 * solo se envía el correo si la persona tiene una cuenta activa con acceso a este colegio.
 */
export async function requestPasswordReset(email: string, school: Tenant, ip?: string): Promise<void> {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, fullName: true, email: true, isActive: true },
  });
  if (!user?.isActive || !(await resolveSchoolRole(user.id, school))) return;
  await prisma.$transaction(async (tx) => {
    await sendPasswordReset(tx, user, school);
    await recordAudit(
      { action: 'auth.password_reset_requested', schoolId: school.id, actorId: user.id, targetType: 'user', targetId: user.id, ip },
      tx,
    );
  });
}

/**
 * Crea o cambia la contraseña con un enlace de invitación o de recuperación.
 * Cierra todas las sesiones abiertas: si alguien conocía la contraseña anterior, queda fuera.
 */
export async function resetPassword(token: string, password: string, ip?: string): Promise<{ purpose: AccountTokenPurpose }> {
  const passwordHash = await hashPassword(password);
  return getPrisma().$transaction(async (tx) => {
    const { userId, purpose, schoolId } = await consumeAccountToken(tx, token);
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await recordAudit(
      {
        action: purpose === AccountTokenPurpose.invite ? 'auth.invitation_accepted' : 'auth.password_reset',
        schoolId,
        actorId: userId,
        targetType: 'user',
        targetId: userId,
        ip,
      },
      tx,
    );
    return { purpose };
  });
}
