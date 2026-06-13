import { Request, Response } from 'express';
import prisma from '../../config/database';

export async function index(req: Request, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = 50;
  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.auditLog.count(),
  ]);

  res.render('admin/audit/index', {
    pageTitle: 'Audit Log',
    logs,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
