/**
 * Genera el artefacto de despliegue:
 *   1. compila el backend (tsc)
 *   2. exporta la versión web de la app (npx expo export -p web)
 *   3. empaqueta todo en ansible/files/gestor-documental.tar.gz
 *
 * En la instancia EC2 se ejecuta `npm ci --omit=dev` (que corre `prisma generate`)
 * y se sirve `public/` como archivos estáticos desde Express.
 *
 * Uso: npm run build:artifact [-- --skip-web]
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as tar from 'tar';

const backendDir = path.resolve(__dirname, '..');
const repoDir = path.resolve(backendDir, '..');
const appDir = path.join(repoDir, 'app');
const outDir = path.join(repoDir, 'ansible', 'files');
const stagingRoot = path.join(backendDir, '.artifact');
const staging = path.join(stagingRoot, 'gestor-documental');
const artifactName = 'gestor-documental.tar.gz';
const skipWeb = process.argv.includes('--skip-web');

function run(cmd: string, cwd: string, env: NodeJS.ProcessEnv = process.env): void {
  console.log(`\n> ${cmd}  (${path.relative(repoDir, cwd) || '.'})`);
  execSync(cmd, { cwd, stdio: 'inherit', env });
}

function copy(from: string, to: string): void {
  fs.cpSync(from, to, { recursive: true });
}

function gitRevision(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: repoDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'sin-commit';
  }
}

async function main(): Promise<void> {
  fs.rmSync(stagingRoot, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });

  // 1. Backend
  fs.rmSync(path.join(backendDir, 'dist'), { recursive: true, force: true });
  run('npm run build', backendDir);
  copy(path.join(backendDir, 'dist'), path.join(staging, 'dist'));
  fs.mkdirSync(path.join(staging, 'prisma'));
  copy(path.join(backendDir, 'prisma', 'schema.prisma'), path.join(staging, 'prisma', 'schema.prisma'));
  copy(path.join(backendDir, 'prisma', 'migrations'), path.join(staging, 'prisma', 'migrations'));
  for (const f of ['package.json', 'package-lock.json']) copy(path.join(backendDir, f), path.join(staging, f));

  // 2. App web (misma origen que la API: EXPO_PUBLIC_API_URL puede quedar vacía)
  if (!skipWeb) {
    if (!fs.existsSync(path.join(appDir, 'package.json'))) throw new Error(`No se encontró la app en ${appDir}`);
    const webOut = path.join(appDir, 'dist');
    fs.rmSync(webOut, { recursive: true, force: true });
    run('npx expo export -p web --output-dir dist', appDir, {
      ...process.env,
      EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL ?? '',
      // Multi-tenant: dominio de los colegios (p. ej. rtlco.cl). Sin colegio por defecto en producción:
      // se fijan aquí para que no se cuelen los valores de desarrollo de app/.env.
      EXPO_PUBLIC_BASE_DOMAIN: process.env.EXPO_PUBLIC_BASE_DOMAIN ?? '',
      EXPO_PUBLIC_SCHOOL: '',
      NODE_ENV: 'production',
    });
    copy(webOut, path.join(staging, 'public'));
  }

  const version = {
    version: (JSON.parse(fs.readFileSync(path.join(backendDir, 'package.json'), 'utf8')) as { version: string }).version,
    revision: gitRevision(),
    builtAt: new Date().toISOString(),
    includesWeb: !skipWeb,
  };
  fs.writeFileSync(path.join(staging, 'VERSION.json'), `${JSON.stringify(version, null, 2)}\n`);

  // 3. Empaquetar
  fs.mkdirSync(outDir, { recursive: true });
  const artifactPath = path.join(outDir, artifactName);
  await tar.create({ gzip: true, file: artifactPath, cwd: stagingRoot, portable: true }, ['gestor-documental']);
  fs.rmSync(stagingRoot, { recursive: true, force: true });

  const sizeMb = (fs.statSync(artifactPath).size / 1024 / 1024).toFixed(2);
  console.log(`\nArtefacto listo: ${path.relative(repoDir, artifactPath)} (${sizeMb} MB) — ${version.version}+${version.revision}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
