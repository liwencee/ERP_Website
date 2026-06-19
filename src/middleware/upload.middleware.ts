import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

// Upload directories. On platforms with an ephemeral filesystem (Railway,
// Render, etc.) these MUST be backed by a persistent volume mounted at
// public/uploads, otherwise user files (KYC docs, payment proofs, avatars)
// are lost on every restart/redeploy. The mkdir below ensures a freshly
// mounted (empty) volume has the expected folders on boot.
const UPLOAD_DIR = path.join(__dirname, '../../public/uploads');
const AVATAR_DIR = path.join(UPLOAD_DIR, 'avatars');
for (const dir of [UPLOAD_DIR, AVATAR_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
});

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
});

const DOC_EXTS = new Set(['.jpg', '.jpeg', '.png', '.pdf']);
const IMG_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// Extension gate only. We deliberately do NOT trust the browser-supplied
// `file.mimetype` here: phones and some browsers send `application/octet-stream`,
// `image/jpg`, `image/pjpeg` etc. for perfectly valid files, which would reject
// legitimate uploads. The real content check happens AFTER upload via magic-byte
// sniffing in `protectedUpload` — far more reliable (and harder to spoof) than
// the client-declared MIME type.
function extFilter(allowed: Set<string>) {
  return (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (allowed.has(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('UNSUPPORTED_EXT'));
  };
}

export const uploadKyc = multer({
  storage,
  fileFilter: extFilter(DOC_EXTS),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

export const uploadProof = multer({
  storage,
  fileFilter: extFilter(DOC_EXTS),
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: extFilter(IMG_EXTS),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

// ─── Content verification (magic bytes) ────────────────────────────────────────

export type FileKind = 'jpg' | 'png' | 'pdf' | 'webp';

// Inspect the real file signature rather than the (spoofable, unreliable) MIME
// header the client sends. Returns the detected kind or null.
function sniff(buf: Buffer): FileKind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'png';
  if (
    buf.length >= 12 &&
    buf.toString('latin1', 0, 4) === 'RIFF' &&
    buf.toString('latin1', 8, 12) === 'WEBP'
  ) return 'webp';
  // PDFs begin with "%PDF"; allow a few leading bytes (BOM/whitespace) to be safe.
  if (buf.toString('latin1', 0, Math.min(buf.length, 16)).includes('%PDF')) return 'pdf';
  return null;
}

interface UploadOpts {
  allowed: FileKind[];
  label: string;     // human-friendly description for error messages
  redirect: string;  // where to send the user on rejection
  maxLabel?: string; // e.g. "5MB" — shown on size errors
}

// Wraps a multer single-file uploader to add two things multer alone can't:
//   1. Graceful error handling — multer rejections (bad extension, file too
//      large) otherwise bubble to the global 500 handler and show an ugly error
//      page. Here they become a friendly flash + redirect.
//   2. Magic-byte content verification — after the file lands on disk we read
//      its real signature and delete it if it doesn't match an allowed type.
// This both UNBREAKS legitimate uploads (no more client-MIME false rejections)
// and HARDENS security (real content check beats a spoofable MIME header).
export function protectedUpload(uploader: multer.Multer, field: string, opts: UploadOpts) {
  const mw = uploader.single(field);
  return (req: Request, res: Response, next: NextFunction): void => {
    mw(req, res, (err: unknown) => {
      if (err) {
        const tooBig = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE';
        req.flash(
          'error',
          tooBig
            ? `That file is too large. Maximum size is ${opts.maxLabel || '5MB'}.`
            : `Unsupported file type. Please upload a ${opts.label}.`,
        );
        res.redirect(opts.redirect);
        return;
      }

      if (req.file) {
        let kind: FileKind | null = null;
        try {
          const fd = fs.openSync(req.file.path, 'r');
          const head = Buffer.alloc(16);
          fs.readSync(fd, head, 0, 16, 0);
          fs.closeSync(fd);
          kind = sniff(head);
        } catch {
          kind = null;
        }

        if (!kind || !opts.allowed.includes(kind)) {
          // Remove the rejected file so we never keep unverified content.
          fs.unlink(req.file.path, () => { /* best-effort cleanup */ });
          req.flash('error', `That file doesn't look like a valid ${opts.label}. Please try again.`);
          res.redirect(opts.redirect);
          return;
        }
      }

      next();
    });
  };
}
