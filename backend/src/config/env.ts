import fs from 'node:fs';
import { z } from 'zod';
import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

const booleanFromString = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
  AWS_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ENDPOINT: z.string().optional().transform((v) => v || undefined),
  S3_PUBLIC_ENDPOINT: z.string().optional().transform((v) => v || undefined),
  S3_FORCE_PATH_STYLE: booleanFromString,
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  LOG_FILE: z.string().optional().transform((v) => v || undefined),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1200),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  // Recuperación de contraseña: solicitudes por IP cada 15 minutos (evita usar el sistema para enviar spam).
  PASSWORD_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  WEB_DIST_DIR: z.string().optional().transform((v) => v || undefined),
  // Multi-tenant: <slug>.BASE_DOMAIN identifica al colegio (p. ej. demo.rtlco.cl).
  // "-" = sin subdominios (valor de SSM, que no admite parámetros vacíos).
  BASE_DOMAIN: z
    .string()
    .optional()
    .transform((v) => (v && v !== '-' ? v.toLowerCase() : undefined)),
  // Colegio usado cuando la solicitud no indica ninguno (solo desarrollo y tests).
  DEFAULT_SCHOOL_SLUG: z.string().optional().transform((v) => v || undefined),
  // URL pública sin subdominios (enlaces en los correos cuando no hay BASE_DOMAIN).
  PUBLIC_URL: z.string().optional().transform((v) => v?.replace(/\/+$/, '') || undefined),
  // Notificaciones: "log" escribe en el log (desarrollo); "ses" envía con Amazon SES; "expo" usa Expo Push.
  MAIL_TRANSPORT: z.enum(['log', 'ses']).default('log'),
  MAIL_FROM: z.string().default('RTLCO <no-responder@rtlco.cl>'),
  PUSH_TRANSPORT: z.enum(['log', 'expo']).default('log'),
  // Worker que procesa el outbox de correos y push en cada instancia (los tests lo invocan a mano).
  NOTIFICATIONS_WORKER: booleanFromString,
});

export type AppConfig = z.infer<typeof envSchema>;

/** Nombre del parámetro en SSM (sin prefijo) → variable de entorno. */
const SSM_PARAMETER_MAP: Record<string, keyof AppConfig> = {
  database_url: 'DATABASE_URL',
  jwt_access_secret: 'JWT_ACCESS_SECRET',
  jwt_refresh_secret: 'JWT_REFRESH_SECRET',
  s3_bucket: 'S3_BUCKET',
  cors_origins: 'CORS_ORIGINS',
  base_domain: 'BASE_DOMAIN',
  public_url: 'PUBLIC_URL',
  mail_transport: 'MAIL_TRANSPORT',
  mail_from: 'MAIL_FROM',
};

/**
 * Lee los parámetros bajo SSM_PARAMETER_PREFIX (SecureString incluidos).
 * La instancia EC2 se autentica con su rol IAM: no hay access keys en disco.
 */
async function loadFromSsm(region: string, prefix: string): Promise<Record<string, string>> {
  const client = new SSMClient({ region });
  const values: Record<string, string> = {};
  let nextToken: string | undefined;
  do {
    const res = await client.send(
      new GetParametersByPathCommand({
        Path: prefix,
        Recursive: true,
        WithDecryption: true,
        NextToken: nextToken,
      }),
    );
    nextToken = res.NextToken;
    for (const p of res.Parameters ?? []) {
      const key = p.Name?.slice(prefix.length).replace(/^\//, '');
      const envName = key ? SSM_PARAMETER_MAP[key] : undefined;
      if (envName && p.Value !== undefined) values[envName] = p.Value;
    }
  } while (nextToken);
  return values;
}

/** Alternativa: un secreto JSON en Secrets Manager con las mismas claves que las variables de entorno. */
async function loadFromSecretsManager(region: string, secretId: string): Promise<Record<string, string>> {
  const client = new SecretsManagerClient({ region });
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  const parsed: unknown = JSON.parse(res.SecretString ?? '{}');
  return z.record(z.string(), z.string()).parse(parsed);
}

let current: AppConfig | undefined;

export async function loadConfig(env: NodeJS.ProcessEnv = process.env): Promise<AppConfig> {
  // En desarrollo se lee backend/.env (no sobrescribe variables ya definidas). En EC2 no existe.
  if (env === process.env && env.NODE_ENV !== 'test' && fs.existsSync('.env')) process.loadEnvFile('.env');
  const source = env.CONFIG_SOURCE ?? 'env';
  const region = env.AWS_REGION ?? 'us-east-1';
  let remote: Record<string, string> = {};
  if (source === 'ssm') {
    remote = await loadFromSsm(region, env.SSM_PARAMETER_PREFIX ?? '/rtlco');
  } else if (source === 'secretsmanager') {
    if (!env.SECRET_ID) throw new Error('CONFIG_SOURCE=secretsmanager requiere SECRET_ID');
    remote = await loadFromSecretsManager(region, env.SECRET_ID);
  }
  // Las variables de entorno explícitas tienen prioridad sobre las remotas.
  const merged = { ...remote, ...stripEmpty(env) };
  const parsed = envSchema.safeParse(merged);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración inválida (origen: ${source}) → ${missing}`);
  }
  current = parsed.data;
  // Prisma lee DATABASE_URL del entorno del proceso.
  process.env.DATABASE_URL = current.DATABASE_URL;
  return current;
}

/** Carga síncrona solo desde variables de entorno (tests). */
export function loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AppConfig {
  current = envSchema.parse(env);
  return current;
}

export function getConfig(): AppConfig {
  if (!current) throw new Error('La configuración no se ha cargado (llama a loadConfig primero)');
  return current;
}

function stripEmpty(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined && v !== '') out[k] = v;
  return out;
}
