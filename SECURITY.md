# Security Report — EPR Access Limited

**Application:** EPR Access investment platform (Node/Express + EJS + Prisma + PostgreSQL)
**Scope:** wallets, deposits/withdrawals, investments, KYC documents, payments, admin.
**Last reviewed:** 2026-06-13

---

## 1. Executive summary

The platform implements a **production-grade security baseline** appropriate for a
fintech/KYC application. Core protections (password hashing, hardened sessions,
security headers, injection-safe data access, signed webhooks, access control,
financial-integrity guards) are in place and, in many cases, covered by an
automated security test suite.

This review hardened **five** additional areas and confirmed the rest by direct
code inspection. A short list of **operational** follow-ups (secret rotation,
backups, dependency updates, optional 2FA) remains and is the owner's to action.

**Overall posture: strong.** No critical gaps remain in code.

---

## 2. What was hardened in this engagement

| # | Area | Before | After |
|---|------|--------|-------|
| 1 | **Uploaded files (KYC/ID, payment proofs)** | Served via public `express.static` — anyone with the URL could open a passport/BVN image | Served through an **authenticated** handler (`src/controllers/files.controller.ts`): must be logged in; regular users get **only their own** files; ADMIN/STAFF may view all (for KYC review). Path-traversal blocked. |
| 2 | **Brute-force / credential stuffing** | Only a generic global limiter | Dedicated **auth limiter** (10 failed attempts / 15 min / IP) on login, register, forgot- & reset-password |
| 3 | **CSRF** | SameSite=Lax cookie only | Added a **same-origin guard** that rejects state-changing requests with a foreign `Origin`/`Referer` (webhooks exempt — they use HMAC) |
| 4 | **Wallet double-spend** | Check-then-debit (race window) | **Atomic conditional debit** (`updateMany … where balance >= amount` inside a transaction) — concurrent withdrawals/investments can't overdraw |
| 5 | **Session fixation** | Session ID kept across login | `req.session.regenerate()` on login — a fresh ID is issued |
| 6 | **Weak session secret** | Fell back to a default string | App **refuses to boot** in production without a strong `SESSION_SECRET` |
| 7 | **Webhook spoofing** | HMAC computed over re-stringified body (could mismatch) | Verified against the **raw request body** (correct bytes); applies to Squad & Paystack |
| 8 | **Seed safety** | Created demo/test accounts with hardcoded passwords and wiped data | Production-safe seed: env-based admin only, no demo accounts, non-destructive |

---

## 3. Production security checklist (audit)

Legend: ✅ in place · ⚠️ partial / recommended · ⬜ not implemented (by design or backlog)

### Authentication & session management
- ✅ Passwords hashed with **bcrypt (cost 12)** — *tested*
- ✅ Server-side sessions in **PostgreSQL** (`connect-pg-simple`)
- ✅ Cookies: `httpOnly`, `Secure` (prod), `SameSite=Lax`, 7-day expiry
- ✅ **Session fixation** prevented (regenerate on login)
- ✅ **Brute-force** throttled (auth limiter)
- ✅ **Force-logout** / session invalidation via `sessionVersion` — *tested*
- ✅ Password reset: single-use token + 1-hour expiry, **no user enumeration**
- ✅ Strong `SESSION_SECRET` enforced at boot
- ⚠️ **2FA** — not implemented; recommended for ADMIN/STAFF
- ⬜ Email verification gate — intentionally disabled (open registration)

### Authorization / access control
- ✅ Route guards: `isAuthenticated`, `isAdmin`, `isAdminOrStaff` — *tested (investor blocked from admin)*
- ✅ **IDOR**: by-ID user routes are admin-only; `redeemEarly` verifies `investment.userId === session user`
- ✅ Sensitive file access is owner/role-checked

### Injection & output safety
- ✅ **SQL injection**: all DB access via Prisma (parameterized) — *tested*
- ✅ **XSS**: EJS `<%= %>` auto-escapes; no user input rendered with raw `<%- %>` — *tested*
- ✅ **Path traversal**: blocked at router and in the upload handler — *tested*
- ✅ File uploads validated by type (jpg/png/pdf) and size (2–5 MB)

### CSRF
- ✅ Same-origin guard on state-changing methods + `SameSite=Lax` cookie
- ✅ Webhooks exempt and instead authenticated by HMAC signatures

### Transport & headers
- ✅ **Helmet**: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, etc.
- ✅ HTTPS enforced (Railway edge) + `Secure` cookies + `trust proxy`
- ✅ CORS restricted to `APP_URL` with credentials
- ⚠️ CSP allows `'unsafe-inline'` scripts — acceptable, but nonce-based CSP would be stronger

### Financial integrity
- ✅ **Atomic wallet debits** — no double-spend — *tested (overdraw) + verified live*
- ✅ Deposit crediting is **idempotent** (webhook + browser callback can't double-credit)
- ✅ Investment min/max + plan-status validated — *tested (closed plan rejected)*
- ✅ Referral commission payout is idempotent (one payout per investment)

### Secrets & configuration
- ✅ **No hardcoded secrets** in production code (scanned) — only test fixtures
- ✅ `.env` git-ignored; config read from environment
- ✅ Webhook secrets verified by HMAC

### Rate limiting / DoS
- ✅ Global limiter + strict auth limiter
- ✅ Request body size limits (10 MB)
- ✅ HTTP Parameter Pollution protection (`hpp`)

### Error handling & logging
- ✅ Global error handler renders a 500 page — **no stack traces leaked** to users
- ✅ Custom 404 handling
- ⚠️ Confirm request logs (morgan/winston) never capture passwords or tokens (currently log method+URL only — OK)

### Data protection / privacy (NDPA)
- ✅ Privacy Policy published
- ✅ KYC/ID documents access-controlled (no longer public)
- ✅ TLS in transit
- ⚠️ Encryption at rest relies on the managed Postgres provider; raw BVN/NIN numbers are **not** stored in the DB (only uploaded images, which are access-controlled). If numeric BVN/NIN is ever stored, encrypt it.

### Testing
- ✅ Automated **security test suite** (`__tests__/security.test.ts`): XSS, SQLi, auth bypass, path traversal, force-logout, overdraw, closed-plan, bcrypt-hash assertions

---

## 4. Remaining recommendations (owner action)

**High (operational, before real money):**
1. **Rotate `SESSION_SECRET`** and set it only in Railway (a value was shared in chat during setup).
2. **Enable database backups** (Railway → Postgres → Backups).
3. Ensure all prod env vars are set: `NODE_ENV=production`, `APP_URL`, payment **live** keys, SMTP.
4. **`npm audit`** and update dependencies (Prisma 5 → 7 available).

**Medium:**
5. **2FA for admin/staff** logins.
6. Tighten **CSP** (replace `'unsafe-inline'` scripts with nonces).
7. Add an **audit log** for admin financial actions (manual wallet credit, withdrawal approve/reject).
8. Move uploads to **object storage (S3/Cloudflare R2) with signed URLs** for durability + scalability (a Railway volume is sufficient to launch).
9. Explicit **account lockout** after repeated failures (beyond rate limiting).

**Low:**
10. Registration reveals "email already exists" (minor account enumeration).
11. Cold-start latency on the trial plan (availability, not security).

---

## 5. Verification status
- Code compiles cleanly (`tsc`) and the security behaviours were verified locally:
  unauthenticated `/uploads/*` → **401**, cross-site POST → **403**, normal login/static unaffected,
  over-balance withdrawal **rejected** with no orphaned record, valid debit exact.
- Automated security tests present and passing in CI/local.
- Live production smoke-test on Railway was pending at time of writing (edge rate-limiting
  briefly throttled the audit's probe IP; the application itself was confirmed booting).
