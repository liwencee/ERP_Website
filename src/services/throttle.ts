import type { Store, Options, ClientRateLimitInfo } from 'express-rate-limit';
import prisma from '../config/database';
import logger from '../utils/logger';

// Postgres-backed fixed-window counters. In-memory counters reset on restart and
// aren't shared between instances (or serverless invocations), which makes them
// easy to sidestep. These are only used on the sensitive endpoints, so the extra
// query per request is negligible.
//
// Every function FAILS OPEN: if the database hiccups we'd rather let a request
// through than lock every user out of logging in.

// Note: Prisma stores DateTime as `timestamp` (UTC, no zone), so the queries
// below compare against timezone('utc', now()) rather than plain now().

/** Count one hit against `key`; starts a new window if the last one expired. */
export async function hit(key: string, windowMs: number): Promise<{ hits: number; resetAt: Date }> {
  const rows = await prisma.$queryRaw<{ hits: number; resetAt: Date }[]>`
    INSERT INTO "RateLimit" ("key", "hits", "resetAt")
    VALUES (${key}, 1, timezone('utc', now()) + ${windowMs}::double precision * interval '1 millisecond')
    ON CONFLICT ("key") DO UPDATE SET
      "hits" = CASE WHEN "RateLimit"."resetAt" <= timezone('utc', now()) THEN 1 ELSE "RateLimit"."hits" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" <= timezone('utc', now()) THEN EXCLUDED."resetAt" ELSE "RateLimit"."resetAt" END
    RETURNING "hits", "resetAt"`;

  // Housekeeping without a scheduler (works on serverless too): ~1% of hits
  // sweep rows that expired over an hour ago.
  if (Math.random() < 0.01) {
    prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "resetAt" < timezone('utc', now()) - interval '1 hour'`.catch(() => {});
  }
  return { hits: Number(rows[0].hits), resetAt: new Date(rows[0].resetAt) };
}

/** Forget a key (e.g. clear failed-login count after a successful login). */
export async function clear(key: string): Promise<void> {
  try {
    await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "key" = ${key}`;
  } catch (err) {
    logger.error(`[throttle] clear failed: ${(err as Error).message}`);
  }
}

/** Is `key` over `max` within its current window? Does not count a hit. */
export async function isLocked(key: string, max: number): Promise<{ locked: boolean; retryAfterMs: number }> {
  try {
    const rows = await prisma.$queryRaw<{ hits: number; resetAt: Date }[]>`
      SELECT "hits", "resetAt" FROM "RateLimit"
      WHERE "key" = ${key} AND "resetAt" > timezone('utc', now())`;
    if (rows.length && Number(rows[0].hits) >= max) {
      return { locked: true, retryAfterMs: Math.max(0, new Date(rows[0].resetAt).getTime() - Date.now()) };
    }
  } catch (err) {
    logger.error(`[throttle] isLocked failed: ${(err as Error).message}`);
  }
  return { locked: false, retryAfterMs: 0 };
}

/** Count a failure against `key`. Never throws. */
export async function recordFailure(key: string, windowMs: number): Promise<void> {
  try {
    await hit(key, windowMs);
  } catch (err) {
    logger.error(`[throttle] recordFailure failed: ${(err as Error).message}`);
  }
}

/** express-rate-limit store that keeps its counters in Postgres. */
export class PgRateLimitStore implements Store {
  private windowMs = 60_000;
  constructor(private readonly keyPrefix: string) {}

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    try {
      const { hits, resetAt } = await hit(`${this.keyPrefix}:${key}`, this.windowMs);
      return { totalHits: hits, resetTime: resetAt };
    } catch (err) {
      logger.error(`[throttle] store increment failed (failing open): ${(err as Error).message}`);
      return { totalHits: 1, resetTime: new Date(Date.now() + this.windowMs) };
    }
  }

  async decrement(key: string): Promise<void> {
    try {
      await prisma.$executeRaw`UPDATE "RateLimit" SET "hits" = GREATEST("hits" - 1, 0) WHERE "key" = ${`${this.keyPrefix}:${key}`}`;
    } catch { /* ignore */ }
  }

  async resetKey(key: string): Promise<void> {
    await clear(`${this.keyPrefix}:${key}`);
  }
}
