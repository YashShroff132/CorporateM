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

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma !== undefined) {
    return globalForPrisma.prisma;
  }

  const databaseUrl = process.env.DATABASE_URL ?? '';

  // Use the Neon serverless HTTP adapter when a DATABASE_URL is configured and
  // we are running in a serverless / edge environment (indicated by the Neon
  // pooler host in the URL). Falls back to the standard PrismaClient locally.
  if (databaseUrl.includes('neon.tech')) {
    // Dynamic import keeps the Neon adapter out of the local dev bundle.
    // We use a synchronous-style initialisation via a module-level promise
    // so the singleton is ready by the time the first query runs.
    const { neon } = require('@neondatabase/serverless');
    const { PrismaNeon } = require('@prisma/adapter-neon');
    const adapter = new PrismaNeon(neon(databaseUrl));
    globalForPrisma.prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
  } else {
    globalForPrisma.prisma = new PrismaClient();
  }

  return globalForPrisma.prisma;
}
