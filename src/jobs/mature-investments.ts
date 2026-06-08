/**
 * Mature Investments Job
 * ─────────────────────
 * Finds all ACTIVE investments whose maturityDate has passed and
 * calls matureInvestment() on each one, crediting the investor's
 * wallet with the expected return and sending a notification.
 *
 * Triggered automatically by server.ts on an hourly interval.
 * Can also be run standalone:
 *   npx ts-node -e "require('./src/jobs/mature-investments').runMaturityJob()"
 */

import prisma from '../config/database';
import { matureInvestment } from '../services/investment.service';
import logger from '../utils/logger';

export async function runMaturityJob(): Promise<void> {
  const now = new Date();

  const matured = await prisma.userInvestment.findMany({
    where: {
      status: 'ACTIVE',
      maturityDate: { lte: now },
    },
    select: { id: true, userId: true },
  });

  if (matured.length === 0) {
    logger.info(`[MaturityJob] No investments to mature at ${now.toISOString()}`);
    return;
  }

  logger.info(`[MaturityJob] Processing ${matured.length} matured investment(s)…`);

  let succeeded = 0;
  let failed = 0;

  for (const inv of matured) {
    try {
      await matureInvestment(inv.id);
      succeeded++;
      logger.info(`[MaturityJob] Matured investment ${inv.id} for user ${inv.userId}`);
    } catch (err) {
      failed++;
      logger.error(`[MaturityJob] Failed to mature ${inv.id}: ${(err as Error).message}`);
    }
  }

  logger.info(`[MaturityJob] Done — ${succeeded} succeeded, ${failed} failed`);
}
