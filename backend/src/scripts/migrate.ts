/**
 * Ejecuta `prisma migrate deploy` con la configuración resuelta (incluida SSM en EC2).
 * Así la DATABASE_URL nunca pasa por Ansible ni queda escrita en disco.
 * Uso: node dist/src/scripts/migrate.js [--seed]
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadConfig } from '../config/env';

async function main(): Promise<void> {
  const config = await loadConfig();
  // dist/src/scripts → raíz del backend
  const root = path.resolve(__dirname, '..', '..', '..');
  const env = { ...process.env, DATABASE_URL: config.DATABASE_URL };
  const prismaBin = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');

  const migrate = spawnSync(process.execPath, [prismaBin, 'migrate', 'deploy'], { cwd: root, env, stdio: 'inherit' });
  if (migrate.status !== 0) process.exit(migrate.status ?? 1);

  if (process.argv.includes('--seed')) {
    const seedScript = path.join(root, 'dist', 'prisma', 'seed.js');
    const seed = spawnSync(process.execPath, [seedScript], { cwd: root, env, stdio: 'inherit' });
    if (seed.status !== 0) process.exit(seed.status ?? 1);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
