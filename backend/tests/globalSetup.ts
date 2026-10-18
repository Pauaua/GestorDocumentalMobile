/**
 * Levanta un PostgreSQL embebido (sin Docker) para los tests, aplica las migraciones
 * versionadas y carga el seed. Si TEST_DATABASE_URL está definida, usa esa base.
 */
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { TEST_DB_NAME, TEST_DB_PORT, testDatabaseUrl } from './testConfig';

// embedded-postgres es solo ESM: se importa con import() nativo (ts-jest lo convertiría en require).
const nativeImport = new Function('specifier', 'return import(specifier)') as <T>(s: string) => Promise<T>;

interface EmbeddedPostgresInstance {
  initialise(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  createDatabase(name: string): Promise<void>;
}

declare global {
  // eslint-disable-next-line no-var
  var __EMBEDDED_PG__: EmbeddedPostgresInstance | undefined;
  // eslint-disable-next-line no-var
  var __EMBEDDED_PG_DIR__: string | undefined;
}

export default async function globalSetup(): Promise<void> {
  if (!process.env.TEST_DATABASE_URL) {
    const { default: EmbeddedPostgres } = await nativeImport<{
      default: new (opts: Record<string, unknown>) => EmbeddedPostgresInstance;
    }>('embedded-postgres');
    const databaseDir = path.join(os.tmpdir(), `gestor-documental-test-pg-${process.pid}`);
    const pg = new EmbeddedPostgres({
      databaseDir,
      user: 'postgres',
      password: 'postgres',
      port: TEST_DB_PORT,
      persistent: false,
      onLog: () => undefined,
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase(TEST_DB_NAME);
    globalThis.__EMBEDDED_PG__ = pg;
    globalThis.__EMBEDDED_PG_DIR__ = databaseDir;
  }

  const root = path.resolve(__dirname, '..');
  const env = { ...process.env, DATABASE_URL: testDatabaseUrl(), PRISMA_HIDE_UPDATE_MESSAGE: '1' };
  // Base recién creada: se aplican las migraciones versionadas tal como en producción.
  // Cada archivo de test limpia sus datos con TRUNCATE + seed (tests/helpers.ts).
  const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { cwd: root, env, stdio: 'pipe' });
}
