export const TEST_DB_PORT = 54329;
export const TEST_DB_NAME = 'gestor_documental_test';

export function testDatabaseUrl(): string {
  return (
    process.env.TEST_DATABASE_URL ??
    `postgresql://postgres:postgres@localhost:${TEST_DB_PORT}/${TEST_DB_NAME}?schema=public`
  );
}
