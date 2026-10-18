import { z } from 'zod';
import { passwordSchema } from '../users/accounts';

export const loginSchema = z.object({
  email: z.email('Correo inválido').transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, 'La contraseña es obligatoria').max(200),
});

export const forgotPasswordSchema = z.object({
  email: z.email('Correo inválido').transform((v) => v.toLowerCase().trim()),
});

export const tokenSchema = z.object({ token: z.string().min(20).max(200) });

export const resetPasswordSchema = tokenSchema.extend({ password: passwordSchema });

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});
