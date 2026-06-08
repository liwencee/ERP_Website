import { Request, Response } from 'express';
import prisma from '../../config/database';

export async function index(req: Request, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const status = (req.query.status as string) || '';
  const limit = 20;
  const skip = (page - 1) * limit;

  const where = status ? { status: status as any } : {};

  const [investments, total] = await Promise.all([
    prisma.userInvestment.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        plan: { select: { name: true, type: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.userInvestment.count({ where }),
  ]);

  res.render('admin/investments/index', {
    pageTitle: 'Investments',
    investments,
    page,
    totalPages: Math.ceil(total / limit),
    statusFilter: status,
  });
}
