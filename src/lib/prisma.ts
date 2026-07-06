/**
 * Prisma client singleton — uses the Neon serverless HTTP adapter in production.
 *
 * On Vercel (and any serverless environment), TCP connections to Postgres are
 * unreliable: cold starts exceed timeouts and PgBouncer transaction-mode
 * breaks Prisma's prepared statements. The Neon serverless adapter sidesteps
 * both problems by routing queries over HTTP (fetch), which works perfectly in
 * serverless with no warm-up needed.
 *
 * In development (no DATABASE_URL or explicit opt-out) the standard PrismaClient
 * is used so local workflow is unchanged.
 *
 * Construction is lazy so importing this module never crashes a build when
 * DATABASE_URL is absent.
 */
import { PrismaClient } from '@prisma/client';
import { neon } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma !== undefined) {
    return globalForPrisma.prisma;
  }

  const databaseUrl = process.env.DATABASE_URL ?? '';

  // Use the Neon serverless HTTP adapter when connected to Neon so queries
  // go over HTTP — no TCP, no PgBouncer prepared-statement issues (Vercel).
  // Falls back to the standard PrismaClient for local dev.
  if (databaseUrl.includes('neon.tech')) {
    const sql = neon(databaseUrl);
    const adapter = new PrismaNeon(sql);
    globalForPrisma.prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
  } else {
    globalForPrisma.prisma = new PrismaClient();
  }

  return globalForPrisma.prisma;
}
