import { Router, type CookieOptions, type Request, type Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { getConfig } from '../../config/env';
import { unauthorized } from '../../lib/errors';
import { authenticate, currentUser } from '../../middleware/auth';
import { activeSchool } from '../../middleware/tenant';
import { recordAudit } from '../../lib/audit';
import { HttpError } from '../../lib/errors';
import { parse } from '../../middleware/validate';
import { describeAccountToken } from './account-tokens';
import { forgotPasswordSchema, loginSchema, refreshSchema, resetPasswordSchema, tokenSchema } from './auth.schemas';
import * as authService from './auth.service';
import { requestPasswordReset, resetPassword } from './password';

export const REFRESH_COOKIE = 'gd_refresh';
const COOKIE_PATH = '/api/v1/auth';

/**
 * Web: el refresh token viaja solo en cookie httpOnly + SameSite=Strict (JavaScript no puede leerlo).
 * Móvil: envía el header X-Client-Platform: native y recibe el refresh token en el cuerpo
 * para guardarlo en expo-secure-store.
 */
function isNativeClient(req: Request): boolean {
  return req.get('x-client-platform') === 'native';
}

function cookieOptions(req: Request, expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    // Detrás del ALB, req.secure depende de X-Forwarded-Proto (trust proxy).
    secure: req.secure,
    path: COOKIE_PATH,
    expires,
  };
}

function sendSession(
  req: Request,
  res: Response,
  user: authService.SessionUser,
  tokens: authService.TokenPair,
): void {
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(req, tokens.refreshTokenExpiresAt));
  res.json({
    user,
    accessToken: tokens.accessToken,
    expiresIn: tokens.accessTokenExpiresIn,
    ...(isNativeClient(req) ? { refreshToken: tokens.refreshToken } : {}),
  });
}

function readRefreshToken(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const body = parse(refreshSchema, req.body ?? {});
  return cookies?.[REFRESH_COOKIE] ?? body.refreshToken;
}

export function authRouter(): Router {
  const router = Router();

  // Solo cuentan los intentos fallidos, por IP + colegio + correo, para frenar fuerza bruta
  // sin bloquear a muchos usuarios legítimos detrás de la misma IP.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: getConfig().LOGIN_RATE_LIMIT_MAX,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const email = (req.body as { email?: unknown } | undefined)?.email;
      const school = req.school?.slug ?? 'plataforma';
      return `${ipKeyGenerator(req.ip ?? 'unknown')}|${school}|${typeof email === 'string' ? email.toLowerCase() : ''}`;
    },
    message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos fallidos. Intenta en unos minutos.' } },
  });

  // Recuperación de contraseña: cuenta todas las solicitudes (no solo las fallidas) para evitar spam de correos.
  const passwordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: getConfig().PASSWORD_RATE_LIMIT_MAX,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? 'unknown')}|password`,
    message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas solicitudes. Intenta en unos minutos.' } },
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const school = activeSchool(req);
    try {
      const { user, tokens } = await authService.login(email, password, school, req.get('user-agent'));
      await recordAudit({ action: 'auth.login', schoolId: school.id, actorId: user.id, targetType: 'user', targetId: user.id, ip: req.ip });
      sendSession(req, res, user, tokens);
    } catch (err) {
      // Intentos fallidos: el correo permite detectar ataques dirigidos a una cuenta.
      if (err instanceof HttpError && err.status === 401) {
        await recordAudit({ action: 'auth.login_failed', schoolId: school.id, metadata: { email }, ip: req.ip });
      }
      throw err;
    }
  });

  router.post('/password/forgot', passwordLimiter, async (req, res) => {
    const { email } = parse(forgotPasswordSchema, req.body);
    await requestPasswordReset(email, activeSchool(req), req.ip);
    // Misma respuesta exista o no la cuenta.
    res.status(204).end();
  });

  // Datos para saludar en la pantalla de "crear contraseña" (no consume el enlace).
  router.get('/password/token', passwordLimiter, async (req, res) => {
    const { token } = parse(tokenSchema, req.query);
    res.json(await describeAccountToken(token));
  });

  router.post('/password/reset', passwordLimiter, async (req, res) => {
    const { token, password } = parse(resetPasswordSchema, req.body);
    res.json(await resetPassword(token, password, req.ip));
  });

  // Consola de la plataforma (superadmin RTLCO): sesión sin colegio.
  router.post('/platform/login', loginLimiter, async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const { user, tokens } = await authService.platformLogin(email, password, req.get('user-agent'));
    sendSession(req, res, user, tokens);
  });

  router.post('/refresh', async (req, res) => {
    const token = readRefreshToken(req);
    if (!token) throw unauthorized('Sesión expirada, vuelve a iniciar sesión');
    const { user, tokens } = await authService.refresh(token, req.school, req.get('user-agent'));
    sendSession(req, res, user, tokens);
  });

  router.post('/logout', async (req, res) => {
    await authService.logout(readRefreshToken(req));
    res.clearCookie(REFRESH_COOKIE, cookieOptions(req));
    res.status(204).end();
  });

  router.get('/me', authenticate, async (req, res) => {
    const user = currentUser(req);
    res.json(await authService.getProfile(user.id, user.role, activeSchool(req)));
  });

  return router;
}
