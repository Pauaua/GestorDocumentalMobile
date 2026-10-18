import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Detiene el PostgreSQL embebido de los tests.
 * En Windows, embedded-postgres lo mata con `taskkill /f /t`: si el postmaster alcanza a relanzar un
 * proceso hijo, ese hijo queda vivo, retiene a Jest (no termina) y ocupa el puerto en la siguiente corrida.
 * Por eso ahí se usa `pg_ctl stop -m fast -w`, que apaga el servidor de forma ordenada y espera a que salga.
 */
export default async function globalTeardown(): Promise<void> {
  const pg = globalThis.__EMBEDDED_PG__;
  const dir = globalThis.__EMBEDDED_PG_DIR__;
  if (!pg) return;
  if (process.platform !== 'win32' || !dir) {
    await pg.stop();
    return;
  }
  const pgCtl = path.resolve(__dirname, '..', 'node_modules', '@embedded-postgres', 'windows-x64', 'native', 'bin', 'pg_ctl.exe');
  execFileSync(pgCtl, ['stop', '-D', dir, '-m', 'fast', '-w', '-t', '60'], { stdio: 'ignore' });
  fs.rmSync(dir, { recursive: true, force: true });
}
