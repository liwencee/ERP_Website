import { Request } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';

interface AuditTarget {
  targetType?: string;
  targetId?: string;
  detail?: string;
}

// Record a sensitive admin/staff action to the append-only audit trail. Never
// throws — an audit failure must not break the action it is recording (the
// failure is logged instead).
export async function logAudit(req: Request, action: string, target: AuditTarget = {}): Promise<void> {
  try {
    const forwarded = (req.headers['x-forwarded-for'] as string) || '';
    const ip = forwarded.split(',')[0].trim() || req.ip || null;
    await prisma.auditLog.create({
      data: {
        actorId: req.session.userId || null,
        actorEmail: req.session.userEmail || null,
        action,
        targetType: target.targetType || null,
        targetId: target.targetId || null,
        detail: target.detail || null,
        ip,
      },
    });
  } catch (e) {
    logger.error(`[audit] failed to record ${action}: ${(e as Error).message}`);
  }
}
