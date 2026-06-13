import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import prisma from '../config/database';

// Absolute root of the uploads directory (KYC docs, payment proofs, avatars).
const UPLOAD_ROOT = path.join(__dirname, '../../public/uploads');

// Authenticated file server for everything under /uploads. These files include
// sensitive identity documents and payment proofs, so they must NOT be world-
// readable via express.static. Access rules:
//   • must be logged in
//   • ADMIN/STAFF may view any file (needed for KYC review)
//   • a regular user may only view files that belong to them (their avatar,
//     their KYC documents, or their own payment proofs)
export async function serveUpload(req: Request, res: Response): Promise<void> {
  // Require authentication first — never reveal whether a file exists to anon users.
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).end();
    return;
  }

  // req.path is relative to the /uploads mount, e.g. "/abc.jpg" or "/avatars/abc.jpg"
  const rel = decodeURIComponent(req.path).replace(/^\/+/, '');
  const filePath = path.join(UPLOAD_ROOT, rel);

  // Block path traversal — the resolved path must stay inside UPLOAD_ROOT.
  if (!filePath.startsWith(UPLOAD_ROOT + path.sep)) {
    res.status(403).end();
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.status(404).end();
    return;
  }

  const role = req.session.userRole;
  if (role === 'ADMIN' || role === 'STAFF') {
    res.sendFile(filePath);
    return;
  }

  // Regular user: confirm the file belongs to them before serving.
  const url = `/uploads/${rel.split(path.sep).join('/')}`;
  const owned =
    (await prisma.user.findFirst({ where: { id: userId, avatar: url }, select: { id: true } })) ||
    (await prisma.document.findFirst({ where: { userId, url }, select: { id: true } })) ||
    (await prisma.transaction.findFirst({ where: { userId, proofUrl: url }, select: { id: true } }));

  if (owned) {
    res.sendFile(filePath);
    return;
  }
  res.status(403).end();
}
