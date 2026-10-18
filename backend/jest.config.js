/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  globalSetup: '<rootDir>/tests/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/globalTeardown.ts',
  setupFiles: ['<rootDir>/tests/env.ts'],
  testTimeout: 30000,
  // El teardown ya detuvo PostgreSQL con pg_ctl (ver tests/globalTeardown.ts); en Windows los pipes de sus
  // procesos hijos tardan en cerrarse y retendrían a Jest varios minutos.
  forceExit: true,
};
