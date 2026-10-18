import { PrismaClient } from '@prisma/client';

let client: PrismaClient | undefined;

/** Cliente Prisma único por proceso (se crea después de cargar DATABASE_URL). */
export function getPrisma(): PrismaClient {
  client ??= new PrismaClient();
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
