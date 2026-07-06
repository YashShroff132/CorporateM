/**
 * Prisma client singleton.
 *
 * A single PrismaClient instance is reused across hot reloads in development to
 * avoid exhausting database connections. Construction is lazy so that importing
 * this module never crashes a build when `DATABASE_URL` is absent — the client
 * is only instantiated on first use inside a request/data-access call.
 */
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma === undefined) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}
