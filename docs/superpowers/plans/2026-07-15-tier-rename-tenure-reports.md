# Tier Rename, Admin Totals, Tenure Change & Reports — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the Silver/Bronze tier naming, show each investor's total invested amount to admins, let investors and admins change an investment's tenure, and provide a printable account statement for investors and admins.

**Architecture:** All work uses the existing Express + EJS + Prisma stack with no schema changes. The tier fix is a plan-name swap (investors auto-reclassify because they stay linked to the same plan row; descriptions stay with their band). Tenure-change math is isolated in a pure function so it can be unit-tested without a database; the DB orchestration wraps it. Reports are a single self-contained EJS template printed via the browser.

**Tech Stack:** TypeScript, Express 4, EJS, Prisma (PostgreSQL), `tsx` for scripts.

## Global Constraints

- **Do NOT push to git.** Local commits only, unless the user explicitly asks to push.
- **No Prisma schema changes and no migrations.** All tasks use the existing schema.
- **No new npm dependencies.** Reports use the browser's print / "Save as PDF".
- **CSP-safe JS only:** no inline `onclick`/`onsubmit`. Reuse the existing `.js-confirm-form` pattern (a submit listener is already wired at the bottom of `views/dashboard/investments.ejs` and `views/admin/users/show.ejs`) and nonce'd `<script>` blocks.
- **Currency is Naira.** Use the existing view helpers `formatCurrency`, `formatDate`, `planDisplayName` (already exposed on `res.locals` by `src/middleware/locals.middleware.ts`).
- **Testing approach (agreed):** the Jest harness is currently broken (Postgres schema vs SQLite test DB), so it is NOT used here. The risky tenure math is covered by a pure standalone unit check run with `tsx`. Everything else is verified with `npx tsc --noEmit` (baseline currently passes cleanly) plus running the app via the preview dev server and manual QA.
- **Windows shell:** commands are written for Git Bash / PowerShell; paths use forward slashes for `npx` args.

---

## File Structure

**Created:**
- `prisma/swap-silver-bronze-names.ts` — one-off live-DB script swapping the two plans' `name` only (operator-run).
- `src/services/tenure.ts` — pure tenure-change computation (no DB import).
- `src/services/tenure.check.ts` — standalone assertion script for `tenure.ts` (run with `tsx`; not picked up by Jest).
- `src/controllers/dashboard/report.controller.ts` — investor statement route handler.
- `views/reports/statement.ejs` — self-contained printable statement template (investor + admin).

**Modified:**
- `src/utils/helpers.ts` — reorder `PLAN_DISPLAY_ORDER`.
- `src/controllers/public/chatbot.controller.ts` — reorder `PLAN_ORDER`.
- `views/partials/public-nav.ejs` — swap the two tier dropdown lines.
- `prisma/seed.ts` — swap the Silver/Bronze `name` strings only (descriptions stay).
- `src/services/investment.service.ts` — add `changeTenure()`.
- `src/controllers/dashboard/investment.controller.ts` — add `changeTenurePost`; extend `index()` include.
- `src/routes/dashboard.routes.ts` — add change-tenure + report routes.
- `src/controllers/admin/users.controller.ts` — add total-invested aggregate to `show()`; add `changeInvestmentTenure` + `report`; extend `show()` include.
- `src/routes/admin.routes.ts` — add admin change-tenure + report routes.
- `views/dashboard/investments.ejs` — tenure-change control + report link.
- `views/admin/users/show.ejs` — total-invested stat, tenure-change control, report link.

---

## Task 1: Reorder tier display everywhere (code + seed)

Relabels the tier order in the three hardcoded lists and the seed so Bronze precedes Silver. Pure text/order edits; no DB.

**Files:**
- Modify: `src/utils/helpers.ts:58`
- Modify: `src/controllers/public/chatbot.controller.ts:4`
- Modify: `views/partials/public-nav.ejs:67-68`
- Modify: `prisma/seed.ts:43-61`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new (edits existing constants/strings).

- [ ] **Step 1: Reorder `PLAN_DISPLAY_ORDER`**

In `src/utils/helpers.ts`, change:

```ts
const PLAN_DISPLAY_ORDER = ['Silver', 'Bronze', 'Gold', 'Diamond', 'Save Future', 'Trading', 'Dollar', 'Fixed Deposit', 'Real Estate'];
```

to:

```ts
const PLAN_DISPLAY_ORDER = ['Bronze', 'Silver', 'Gold', 'Diamond', 'Save Future', 'Trading', 'Dollar', 'Fixed Deposit', 'Real Estate'];
```

- [ ] **Step 2: Reorder `PLAN_ORDER` in the chatbot**

In `src/controllers/public/chatbot.controller.ts`, change:

```ts
const PLAN_ORDER = ['Save Future', 'Silver', 'Bronze', 'Gold', 'Diamond', 'Fixed Deposit', 'Trading', 'Dollar', 'Real Estate'];
```

to:

```ts
const PLAN_ORDER = ['Save Future', 'Bronze', 'Silver', 'Gold', 'Diamond', 'Fixed Deposit', 'Trading', 'Dollar', 'Real Estate'];
```

- [ ] **Step 3: Reorder the two dropdown lines in the nav (hrefs unchanged)**

Because the swap exchanges only the `name` between rows, the set of plan names — and therefore both slugs — is unchanged; only the display order changes. In `views/partials/public-nav.ejs`, these two lines currently read:

```html
            <li><a href="/investment-plans/silver-my-investment-splus">Silver – Package</a></li>
            <li><a href="/investment-plans/bronze-my-investment-bplus">Bronze – Package</a></li>
```

Reorder so Bronze is first, keeping the hrefs exactly as they are:

```html
            <li><a href="/investment-plans/bronze-my-investment-bplus">Bronze – Package</a></li>
            <li><a href="/investment-plans/silver-my-investment-splus">Silver – Package</a></li>
```

After Task 2's DB swap, `bronze-my-investment-bplus` is the entry-level band (correctly labelled Bronze) and `silver-my-investment-splus` is the mid-tier band (correctly labelled Silver).

- [ ] **Step 4: Swap ONLY the `name` strings in the seed (descriptions stay)**

In `prisma/seed.ts`, swap only the `name` values between the two tier objects, leaving each object's `description`, `minAmount`, `maxAmount`, `returnRate`, `duration`, and `tenures` untouched. The description stays with its band (entry-level text stays on the min-50000 object, now named Bronze).

Change the entry-level object's `name` line (currently `name: 'Silver – My Investment SPlus',`, the object whose `minAmount` is `50000`) to:

```ts
      name: 'Bronze – My Investment BPlus',
```

Change the mid-tier object's `name` line (currently `name: 'Bronze – My Investment BPlus',`, the object whose `minAmount` is `5000001`) to:

```ts
      name: 'Silver – My Investment SPlus',
```

Do NOT touch either object's `description` or any other field.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0 with no output.

- [ ] **Step 6: Commit**

```bash
git add src/utils/helpers.ts src/controllers/public/chatbot.controller.ts views/partials/public-nav.ejs prisma/seed.ts
git commit -m "Reorder Bronze before Silver in tier display and seed"
```

---

## Task 2: Live-DB swap script for Silver ↔ Bronze names

A standalone, operator-run script that swaps the two rows' `name`/`description` in a transaction and prints before/after plus affected investors. Cannot be executed from this environment (no DB access) — verification is type-check + review; the operator runs it against the live DB.

**Files:**
- Create: `prisma/swap-silver-bronze-names.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by other tasks (operational script).

- [ ] **Step 1: Write the script**

Create `prisma/swap-silver-bronze-names.ts`:

```ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// One-off: swap ONLY the `name` between the two tier rows so the entry-level
// plan (₦50,000–₦5,000,000) is named "Bronze" and the mid-tier
// (₦5,000,001–₦15,000,000) is named "Silver". Descriptions are NOT swapped —
// each row's description describes its band, which does not move. Amount bands,
// return rates, tenures and every UserInvestment are left untouched — investors
// stay linked to the same row and therefore re-label automatically. Symmetric:
// re-running swaps the names back.
//
// Run against the LIVE DB (never hardcode the password):
//   DATABASE_URL="postgres://...proxy.rlwy.net:PORT/railway" \
//     npx tsx prisma/swap-silver-bronze-names.ts
async function main() {
  const silver = await prisma.investmentPlan.findFirst({ where: { name: { contains: 'Silver' } } });
  const bronze = await prisma.investmentPlan.findFirst({ where: { name: { contains: 'Bronze' } } });

  if (!silver || !bronze) {
    throw new Error(`Could not find both tiers (silver=${!!silver}, bronze=${!!bronze}). Aborting.`);
  }

  console.log('--- BEFORE ---');
  for (const p of [silver, bronze]) {
    console.log(`${p.name} | min=${p.minAmount} max=${p.maxAmount} return=${p.returnRate}%`);
    const holders = await prisma.userInvestment.findMany({
      where: { planId: p.id },
      include: { user: { select: { email: true } } },
    });
    console.log(`  holders (${holders.length}): ${holders.map((h) => h.user.email).join(', ') || 'none'}`);
  }

  await prisma.$transaction([
    prisma.investmentPlan.update({
      where: { id: silver.id },
      data: { name: bronze.name },
    }),
    prisma.investmentPlan.update({
      where: { id: bronze.id },
      data: { name: silver.name },
    }),
  ]);

  console.log('--- AFTER ---');
  const after = await prisma.investmentPlan.findMany({
    where: { id: { in: [silver.id, bronze.id] } },
    orderBy: { minAmount: 'asc' },
    select: { name: true, minAmount: true, maxAmount: true, returnRate: true },
  });
  for (const p of after) {
    console.log(`${p.name} | min=${p.minAmount} max=${p.maxAmount} return=${p.returnRate}%`);
  }
  console.log('Swap complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0 with no output.

- [ ] **Step 3: Commit**

```bash
git add prisma/swap-silver-bronze-names.ts
git commit -m "Add one-off script to swap Silver/Bronze plan names on live DB"
```

- [ ] **Step 4: Operator run (manual, outside this plan's automation)**

The operator runs, against the live DB, from the project root:

```bash
DATABASE_URL="<live postgres proxy url>" npx tsx prisma/swap-silver-bronze-names.ts
```

Then cross-checks the printed "holders" emails for the entry-level (now Bronze) plan against the known list of affected investors. Re-running reverts if needed.

---

## Task 3: Admin — total invested per investor

Adds a "Total Invested" figure (sum of principal across ALL the investor's investments, any status) to the admin user page.

**Files:**
- Modify: `src/controllers/admin/users.controller.ts:41-60` (the `show` function)
- Modify: `views/admin/users/show.ejs:29` (profile card)

**Interfaces:**
- Consumes: nothing.
- Produces: `totalInvested: number` passed to `admin/users/show`.

- [ ] **Step 1: Compute the aggregate in `show()`**

In `src/controllers/admin/users.controller.ts`, inside `show()`, after the `referralCount` line and before `res.render(...)`, add:

```ts
  const investedAgg = await prisma.userInvestment.aggregate({
    where: { userId: user.id },
    _sum: { amount: true },
  });
  const totalInvested = Number(investedAgg._sum.amount ?? 0);
```

Then update the render call to pass it:

```ts
  res.render('admin/users/show', { pageTitle: `User: ${user.firstName}`, profileUser: user, referralCount, totalInvested });
```

- [ ] **Step 2: Render the stat in the profile card**

In `views/admin/users/show.ejs`, immediately after the "Referrals Made" line (`<p class="text-muted">Referrals Made: ...</p>`), add:

```html
          <p class="text-muted">Total Invested: <strong class="text-gold"><%= formatCurrency(totalInvested) %></strong></p>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Verify in the app**

Start the preview dev server; open `/admin/users/:id` for a user who has investments; confirm "Total Invested: ₦X" shows the sum of that user's investment principals. (Verification is via the running app since Jest is unavailable.)

- [ ] **Step 5: Commit**

```bash
git add src/controllers/admin/users.controller.ts views/admin/users/show.ejs
git commit -m "Show total invested principal on admin user page"
```

---

## Task 4: Pure tenure-change computation + standalone unit check

Isolates the money math (new expected return + new maturity, with the past-maturity guard) in a pure, DB-free function and proves it with a `tsx`-run assertion script.

**Files:**
- Create: `src/services/tenure.ts`
- Create: `src/services/tenure.check.ts`

**Interfaces:**
- Consumes: `addDays` from `src/utils/helpers.ts`.
- Produces: `computeTenureChange(startDate: Date, principal: number, newReturnRate: number, newDurationDays: number, now?: Date): { expectedReturn: number; maturityDate: Date }` — thrown `Error` when the new maturity is not strictly in the future. Consumed by Task 5.

- [ ] **Step 1: Write the failing check**

Create `src/services/tenure.check.ts`:

```ts
import assert from 'node:assert';
import { computeTenureChange } from './tenure';

function run(): void {
  const start = new Date('2026-01-01T00:00:00Z');
  const now = new Date('2026-02-01T00:00:00Z'); // one month into the hold

  // 1. Extend to a longer, future tenure: return + maturity recomputed from start.
  const r1 = computeTenureChange(start, 100000, 30, 365, now);
  assert.strictEqual(r1.expectedReturn, 130000, 'principal + 30%');
  assert.strictEqual(r1.maturityDate.toISOString().slice(0, 10), '2027-01-01', 'start + 365d');

  // 2. Switch to a shorter BUT still-future tenure is allowed.
  const r2 = computeTenureChange(start, 50000, 12, 180, now);
  assert.strictEqual(r2.expectedReturn, 56000, 'principal + 12%');
  assert.strictEqual(r2.maturityDate.toISOString().slice(0, 10), '2026-06-30', 'start + 180d');

  // 3. A tenure whose maturity is already in the past is rejected.
  assert.throws(
    () => computeTenureChange(start, 50000, 12, 10, now),
    /already held this investment longer/,
    'past maturity must throw'
  );

  // 4. Maturity exactly equal to now (<=) is rejected.
  assert.throws(
    () => computeTenureChange(start, 1000, 5, 30, new Date('2026-01-31T00:00:00Z')),
    /already held this investment longer/,
    'maturity == now must throw'
  );

  console.log('All tenure computation checks passed.');
}

run();
```

- [ ] **Step 2: Run it to confirm it fails (module not yet created)**

Run: `npx tsx src/services/tenure.check.ts`
Expected: FAIL — cannot find module `./tenure`.

- [ ] **Step 3: Write the pure function**

Create `src/services/tenure.ts`:

```ts
import { addDays } from '../utils/helpers';

export interface TenureChangeComputation {
  expectedReturn: number;
  maturityDate: Date;
}

// Pure calculation for changing an investment's tenure.
// - maturityDate is measured from the ORIGINAL start date (not "now"), so the
//   total lock period matches the chosen tenure.
// - expectedReturn = principal + principal * newReturnRate% (2dp).
// Throws when the recomputed maturity is not strictly in the future — that would
// be an early withdrawal, which is out of scope for a tenure change.
export function computeTenureChange(
  startDate: Date,
  principal: number,
  newReturnRate: number,
  newDurationDays: number,
  now: Date = new Date()
): TenureChangeComputation {
  const maturityDate = addDays(startDate, newDurationDays);
  if (maturityDate.getTime() <= now.getTime()) {
    throw new Error(
      'You have already held this investment longer than the selected tenure. Choose a tenure that matures in the future.'
    );
  }
  const expectedReturn = parseFloat((principal * (1 + newReturnRate / 100)).toFixed(2));
  return { expectedReturn, maturityDate };
}
```

- [ ] **Step 4: Run the check to confirm it passes**

Run: `npx tsx src/services/tenure.check.ts`
Expected: prints `All tenure computation checks passed.` and exits 0.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/services/tenure.ts src/services/tenure.check.ts
git commit -m "Add pure tenure-change computation with standalone unit check"
```

---

## Task 5: `changeTenure` service (DB orchestration)

Wraps the pure function with load/validate/update/notify against the database.

**Files:**
- Modify: `src/services/investment.service.ts` (add function + import)

**Interfaces:**
- Consumes: `computeTenureChange` from Task 4; `prisma`.
- Produces: `changeTenure(investmentId: string, newTenureId: string): Promise<{ oldTenureLabel: string | null; newTenureLabel: string; newReturnRate: number; expectedReturn: number; maturityDate: Date }>`. Consumed by Tasks 6 and 7.

- [ ] **Step 1: Import the pure function**

At the top of `src/services/investment.service.ts`, add to the existing imports:

```ts
import { computeTenureChange } from './tenure';
```

- [ ] **Step 2: Add the `changeTenure` function**

Append to `src/services/investment.service.ts`:

```ts
// Change the tenure of an ACTIVE investment. Recomputes expected return and
// maturity from the ORIGINAL start date via the pure computeTenureChange().
// Referral commissions already paid at creation are intentionally NOT adjusted.
export async function changeTenure(
  investmentId: string,
  newTenureId: string
): Promise<{
  oldTenureLabel: string | null;
  newTenureLabel: string;
  newReturnRate: number;
  expectedReturn: number;
  maturityDate: Date;
}> {
  const inv = await prisma.userInvestment.findUnique({
    where: { id: investmentId },
    include: { plan: { include: { tenures: true } }, tenure: true },
  });
  if (!inv) throw new Error('Investment not found.');
  if (inv.status !== 'ACTIVE') throw new Error('Only active investments can have their tenure changed.');
  if (inv.plan.tenures.length === 0) throw new Error('This plan does not support tenure changes.');

  const newTenure = inv.plan.tenures.find((t) => t.id === newTenureId);
  if (!newTenure) throw new Error('Please select a valid tenure for this plan.');

  const { expectedReturn, maturityDate } = computeTenureChange(
    inv.startDate,
    Number(inv.amount),
    Number(newTenure.returnRate),
    newTenure.durationDays
  );

  await prisma.userInvestment.update({
    where: { id: inv.id },
    data: { tenureId: newTenure.id, expectedReturn, maturityDate },
  });

  await prisma.notification.create({
    data: {
      userId: inv.userId,
      title: 'Investment Tenure Updated',
      message: `Your ${inv.plan.name} tenure is now "${newTenure.label}". New expected value at maturity: ₦${expectedReturn.toLocaleString()} on ${maturityDate.toLocaleDateString('en-NG')}.`,
    },
  });

  return {
    oldTenureLabel: inv.tenure?.label ?? null,
    newTenureLabel: newTenure.label,
    newReturnRate: Number(newTenure.returnRate),
    expectedReturn,
    maturityDate,
  };
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/services/investment.service.ts
git commit -m "Add changeTenure service orchestration"
```

---

## Task 6: Investor-facing tenure change (route, controller, UI)

Lets an investor change the tenure of their own active investment from the dashboard.

**Files:**
- Modify: `src/controllers/dashboard/investment.controller.ts` (extend `index()` include; add `changeTenurePost`)
- Modify: `src/routes/dashboard.routes.ts`
- Modify: `views/dashboard/investments.ejs` (Action column)

**Interfaces:**
- Consumes: `investmentService.changeTenure` (Task 5).
- Produces: `POST /dashboard/investments/:id/change-tenure`.

- [ ] **Step 1: Include plan tenures in the investments list query**

In `src/controllers/dashboard/investment.controller.ts` `index()`, change the `myInvestments` query's include from:

```ts
      include: { plan: true, tenure: true },
```

to:

```ts
      include: { plan: { include: { tenures: { orderBy: { sortOrder: 'asc' } } } }, tenure: true },
```

- [ ] **Step 2: Add the `changeTenurePost` handler**

Append to `src/controllers/dashboard/investment.controller.ts`:

```ts
export async function changeTenurePost(req: Request, res: Response): Promise<void> {
  const userId = req.session.userId!;
  const { tenureId } = req.body;

  const investment = await prisma.userInvestment.findUnique({ where: { id: req.params.id } });
  if (!investment || investment.userId !== userId) {
    req.flash('error', 'Investment not found.');
    res.redirect('/dashboard/investments');
    return;
  }

  try {
    const result = await investmentService.changeTenure(req.params.id, tenureId);
    req.flash(
      'success',
      `Tenure changed to ${result.newTenureLabel}. New maturity ${result.maturityDate.toLocaleDateString('en-NG')}, expected ₦${result.expectedReturn.toLocaleString()}.`
    );
  } catch (err) {
    req.flash('error', err instanceof Error ? err.message : 'Could not change tenure.');
  }
  res.redirect('/dashboard/investments');
}
```

(`prisma` and `investmentService` are already imported at the top of this file.)

- [ ] **Step 3: Register the route**

In `src/routes/dashboard.routes.ts`, after the existing `redeem-early` line, add:

```ts
router.post('/investments/:id/change-tenure', investment.changeTenurePost);
```

- [ ] **Step 4: Add the tenure-change control to the Action column**

In `views/dashboard/investments.ejs`, replace the current Action cell block:

```html
                <td>
                  <% if (inv.status === 'ACTIVE' && inv.plan.type === 'SAVINGS') { %>
                    <form action="/dashboard/investments/<%= inv.id %>/redeem-early" method="POST" class="js-confirm-form" data-confirm="Early withdrawal returns principal only — no interest. Continue?">
                      <button type="submit" class="btn btn-sm btn-danger">Withdraw Early</button>
                    </form>
                  <% } else if (inv.status === 'ACTIVE' && !isMatured) { %>
                    <span class="text-muted text-sm">Locked</span>
                  <% } else { %>
                    <span class="text-muted text-sm">—</span>
                  <% } %>
                </td>
```

with:

```html
                <td>
                  <% if (inv.status === 'ACTIVE' && inv.plan.type === 'SAVINGS') { %>
                    <form action="/dashboard/investments/<%= inv.id %>/redeem-early" method="POST" class="js-confirm-form" data-confirm="Early withdrawal returns principal only — no interest. Continue?">
                      <button type="submit" class="btn btn-sm btn-danger">Withdraw Early</button>
                    </form>
                  <% } %>
                  <% if (inv.status === 'ACTIVE' && inv.plan.tenures && inv.plan.tenures.length > 0) { %>
                    <form action="/dashboard/investments/<%= inv.id %>/change-tenure" method="POST" class="js-confirm-form" data-confirm="Change this investment's tenure? Your expected return and maturity date will be recalculated." style="display:flex;gap:6px;align-items:center;margin-top:4px;">
                      <select name="tenureId" required class="tenure-select">
                        <% inv.plan.tenures.forEach(function (t) { %>
                        <option value="<%= t.id %>" <%= inv.tenureId === t.id ? 'selected' : '' %>><%= t.label %> — <%= Number(t.returnRate) %>%</option>
                        <% }) %>
                      </select>
                      <button type="submit" class="btn btn-sm btn-outline-gold">Change</button>
                    </form>
                  <% } else if (inv.status !== 'ACTIVE') { %>
                    <span class="text-muted text-sm">—</span>
                  <% } %>
                </td>
```

(The `.js-confirm-form` submit listener already wired at the bottom of this file adds the confirm dialog — no new script needed.)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 6: Verify in the app**

On the preview dev server, log in as an investor with an active tiered investment; on `/dashboard/investments`, pick a different tenure and submit; confirm the flash shows the new maturity/expected value and the "My Investments" row reflects the new tenure, expected return, and maturity. Also confirm choosing a tenure already fully elapsed is rejected with the guard message.

- [ ] **Step 7: Commit**

```bash
git add src/controllers/dashboard/investment.controller.ts src/routes/dashboard.routes.ts views/dashboard/investments.ejs
git commit -m "Let investors change the tenure of an active investment"
```

---

## Task 7: Admin-facing tenure change (route, controller, UI, audit)

Lets an admin change the tenure of any user's active investment from the admin user page, with an audit-log entry.

**Files:**
- Modify: `src/controllers/admin/users.controller.ts` (import service; extend `show()` include; add `changeInvestmentTenure`)
- Modify: `src/routes/admin.routes.ts`
- Modify: `views/admin/users/show.ejs` (Investments table)

**Interfaces:**
- Consumes: `investmentService.changeTenure` (Task 5); `logAudit`.
- Produces: `POST /admin/users/:userId/investments/:id/change-tenure`.

- [ ] **Step 1: Import the investment service**

At the top of `src/controllers/admin/users.controller.ts`, add:

```ts
import * as investmentService from '../../services/investment.service';
```

- [ ] **Step 2: Include plan tenures + tenure in the `show()` query**

In `src/controllers/admin/users.controller.ts` `show()`, change the investments include from:

```ts
      investments: { include: { plan: true }, orderBy: { createdAt: 'desc' } },
```

to:

```ts
      investments: {
        include: { plan: { include: { tenures: { orderBy: { sortOrder: 'asc' } } } }, tenure: true },
        orderBy: { createdAt: 'desc' },
      },
```

- [ ] **Step 3: Add the `changeInvestmentTenure` handler**

Append to `src/controllers/admin/users.controller.ts`:

```ts
// Admin changes the tenure of a specific investment belonging to a user.
export async function changeInvestmentTenure(req: Request, res: Response): Promise<void> {
  const { userId, id } = req.params;
  const { tenureId } = req.body;

  const investment = await prisma.userInvestment.findUnique({ where: { id } });
  if (!investment || investment.userId !== userId) {
    req.flash('error', 'Investment not found for this user.');
    res.redirect(`/admin/users/${userId}`);
    return;
  }

  try {
    const result = await investmentService.changeTenure(id, tenureId);
    await logAudit(req, 'INVESTMENT_TENURE_CHANGE', {
      targetType: 'UserInvestment',
      targetId: id,
      detail: `${result.oldTenureLabel ?? '—'} → ${result.newTenureLabel} (expected ₦${result.expectedReturn.toLocaleString()}, matures ${result.maturityDate.toISOString().slice(0, 10)})`,
    });
    req.flash('success', `Tenure changed to ${result.newTenureLabel} for this investment.`);
  } catch (err) {
    req.flash('error', err instanceof Error ? err.message : 'Could not change tenure.');
  }
  res.redirect(`/admin/users/${userId}`);
}
```

- [ ] **Step 4: Register the route**

In `src/routes/admin.routes.ts`, in the Users section (after the `debit-wallet` line), add:

```ts
router.post('/users/:userId/investments/:id/change-tenure', adminUsers.changeInvestmentTenure);
```

- [ ] **Step 5: Add an Action column with the tenure control**

In `views/admin/users/show.ejs`, in the Investments table, add an `Action` header. Change the table head:

```html
                <thead><tr><th>Plan</th><th>Amount</th><th>Expected</th><th>Maturity</th><th>Status</th></tr></thead>
```

to:

```html
                <thead><tr><th>Plan</th><th>Amount</th><th>Expected</th><th>Maturity</th><th>Status</th><th>Action</th></tr></thead>
```

Then, inside the `profileUser.investments.forEach` row, add a new final cell after the Status `<td>`:

```html
                    <td>
                      <% if (inv.status === 'ACTIVE' && inv.plan.tenures && inv.plan.tenures.length > 0) { %>
                      <form action="/admin/users/<%= profileUser.id %>/investments/<%= inv.id %>/change-tenure" method="POST" class="js-confirm-form" data-confirm="Change this investment's tenure? Expected return and maturity will be recalculated." style="display:flex;gap:6px;align-items:center;">
                        <select name="tenureId" required>
                          <% inv.plan.tenures.forEach(function (t) { %>
                          <option value="<%= t.id %>" <%= inv.tenureId === t.id ? 'selected' : '' %>><%= t.label %> — <%= Number(t.returnRate) %>%</option>
                          <% }) %>
                        </select>
                        <button type="submit" class="btn btn-sm btn-outline-gold">Change</button>
                      </form>
                      <% } else { %>
                      <span class="text-muted">—</span>
                      <% } %>
                    </td>
```

(The generic `.js-confirm-form` listener already at the bottom of this file supplies the confirm.)

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 7: Verify in the app**

On the preview dev server, as an admin open `/admin/users/:id` for a user with an active tiered investment; change the tenure via the new control; confirm the flash success, the updated Expected/Maturity in the table, and a new `INVESTMENT_TENURE_CHANGE` row under `/admin/audit`.

- [ ] **Step 8: Commit**

```bash
git add src/controllers/admin/users.controller.ts src/routes/admin.routes.ts views/admin/users/show.ejs
git commit -m "Let admins change an investment's tenure with audit logging"
```

---

## Task 8: Investor printable statement (template + route + link)

A self-contained, print-friendly statement page for the logged-in investor, opened from the Investments page.

**Files:**
- Create: `views/reports/statement.ejs`
- Create: `src/controllers/dashboard/report.controller.ts`
- Modify: `src/routes/dashboard.routes.ts`
- Modify: `views/dashboard/investments.ejs` (report link)

**Interfaces:**
- Consumes: `res.locals` helpers (`formatCurrency`, `formatDate`, `planDisplayName`).
- Produces: `GET /dashboard/report`; the `views/reports/statement.ejs` template (also reused by Task 9). Template contract: `{ profileUser (with wallet, investments incl. plan+tenure, transactions), totalInvested: number, totalExpected: number, generatedAt: Date }`.

- [ ] **Step 1: Create the statement template**

Create `views/reports/statement.ejs`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Account Statement | EPR Access Limited</title>
  <style nonce="<%= cspNonce %>">
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1f2733; margin: 0; padding: 24px; background: #f4f5f7; }
    .statement { max-width: 900px; margin: 0 auto; background: #fff; padding: 32px; border-radius: 8px; }
    .st-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0a1628; padding-bottom: 16px; margin-bottom: 20px; }
    .st-brand { font-size: 1.4rem; font-weight: 800; color: #0a1628; }
    .st-brand small { display: block; font-size: 0.75rem; font-weight: 600; color: #6b7280; letter-spacing: 0.08em; }
    .st-meta { text-align: right; font-size: 0.85rem; color: #6b7280; }
    h2 { font-size: 1.05rem; color: #0a1628; margin: 24px 0 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; color: #6b7280; text-transform: uppercase; font-size: 0.72rem; letter-spacing: 0.04em; }
    .totals { display: flex; gap: 24px; flex-wrap: wrap; margin: 20px 0; }
    .totals div { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; }
    .totals span { display: block; font-size: 0.72rem; color: #6b7280; text-transform: uppercase; }
    .totals strong { font-size: 1.1rem; color: #0a1628; }
    .print-bar { max-width: 900px; margin: 0 auto 16px; text-align: right; }
    .print-btn { background: #0a1628; color: #fff; border: 0; border-radius: 6px; padding: 10px 18px; font-size: 0.9rem; cursor: pointer; }
    @media print {
      body { background: #fff; padding: 0; }
      .statement { box-shadow: none; border-radius: 0; max-width: none; padding: 0; }
      .print-bar { display: none; }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <button type="button" class="print-btn" id="printBtn">Print / Save as PDF</button>
  </div>
  <div class="statement">
    <div class="st-head">
      <div class="st-brand">EPR Access Limited<small>Account Statement</small></div>
      <div class="st-meta">
        <div><strong><%= profileUser.firstName %> <%= profileUser.lastName %></strong></div>
        <div><%= profileUser.email %></div>
        <div>Generated: <%= formatDate(generatedAt) %></div>
      </div>
    </div>

    <div class="totals">
      <div><span>Total Invested</span><strong><%= formatCurrency(totalInvested) %></strong></div>
      <div><span>Total Expected Return</span><strong><%= formatCurrency(totalExpected) %></strong></div>
      <div><span>Wallet Balance</span><strong><%= formatCurrency(profileUser.wallet ? Number(profileUser.wallet.balance) : 0) %></strong></div>
    </div>

    <h2>Investments (<%= profileUser.investments.length %>)</h2>
    <% if (profileUser.investments.length) { %>
    <table>
      <thead><tr><th>Plan</th><th>Tenure</th><th>Amount</th><th>Expected</th><th>Start</th><th>Maturity</th><th>Status</th></tr></thead>
      <tbody>
        <% profileUser.investments.forEach(function (inv) { %>
        <tr>
          <td><%= planDisplayName(inv.plan.name) %></td>
          <td><%= inv.tenure ? inv.tenure.label : '—' %></td>
          <td><%= formatCurrency(Number(inv.amount)) %></td>
          <td><%= formatCurrency(Number(inv.expectedReturn)) %></td>
          <td><%= formatDate(inv.startDate) %></td>
          <td><%= formatDate(inv.maturityDate) %></td>
          <td><%= inv.status %></td>
        </tr>
        <% }) %>
      </tbody>
    </table>
    <% } else { %><p>No investments.</p><% } %>

    <h2>Transactions (<%= profileUser.transactions.length %>)</h2>
    <% if (profileUser.transactions.length) { %>
    <table>
      <thead><tr><th>Type</th><th>Amount</th><th>Reference</th><th>Date</th><th>Status</th></tr></thead>
      <tbody>
        <% profileUser.transactions.forEach(function (tx) { %>
        <tr>
          <td><%= tx.type %></td>
          <td><%= formatCurrency(Number(tx.amount)) %></td>
          <td><%= tx.reference %></td>
          <td><%= formatDate(tx.createdAt) %></td>
          <td><%= tx.status %></td>
        </tr>
        <% }) %>
      </tbody>
    </table>
    <% } else { %><p>No transactions.</p><% } %>
  </div>
  <script nonce="<%= cspNonce %>">
    document.getElementById('printBtn')?.addEventListener('click', function () { window.print(); });
  </script>
</body>
</html>
```

- [ ] **Step 2: Create the investor report controller**

Create `src/controllers/dashboard/report.controller.ts`:

```ts
import { Request, Response } from 'express';
import prisma from '../../config/database';

export async function statement(req: Request, res: Response): Promise<void> {
  const userId = req.session.userId!;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      wallet: true,
      investments: { include: { plan: true, tenure: true }, orderBy: { createdAt: 'desc' } },
      transactions: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!user) {
    req.flash('error', 'Account not found.');
    res.redirect('/dashboard');
    return;
  }

  const totalInvested = user.investments.reduce((s, i) => s + Number(i.amount), 0);
  const totalExpected = user.investments.reduce((s, i) => s + Number(i.expectedReturn), 0);

  res.render('reports/statement', {
    profileUser: user,
    totalInvested,
    totalExpected,
    generatedAt: new Date(),
  });
}
```

- [ ] **Step 3: Register the investor route**

In `src/routes/dashboard.routes.ts`, add the import near the other controller imports:

```ts
import * as report from '../controllers/dashboard/report.controller';
```

and the route (after the transactions route):

```ts
router.get('/report', report.statement);
```

- [ ] **Step 4: Add the report link on the investments page**

In `views/dashboard/investments.ejs`, change the "My Investments" section heading from:

```html
        <h3>My Investments</h3>
```

to:

```html
        <div class="section-header-row">
          <h3>My Investments</h3>
          <a href="/dashboard/report" target="_blank" rel="noopener" class="btn btn-sm btn-outline-gold">Download / Print Report</a>
        </div>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 6: Verify in the app**

On the preview dev server, as an investor click "Download / Print Report" on `/dashboard/investments`; confirm `/dashboard/report` opens a clean statement in a new tab with correct totals, investments, and transactions, and that the browser Print dialog (via the button) hides the button and nav chrome.

- [ ] **Step 7: Commit**

```bash
git add views/reports/statement.ejs src/controllers/dashboard/report.controller.ts src/routes/dashboard.routes.ts views/dashboard/investments.ejs
git commit -m "Add printable investor account statement"
```

---

## Task 9: Admin printable statement for any user (route + link)

Reuses the Task 8 template so an admin can generate/print any investor's statement.

**Files:**
- Modify: `src/controllers/admin/users.controller.ts` (add `report`)
- Modify: `src/routes/admin.routes.ts`
- Modify: `views/admin/users/show.ejs` (report link)

**Interfaces:**
- Consumes: `views/reports/statement.ejs` (Task 8) with the same template contract.
- Produces: `GET /admin/users/:id/report`.

- [ ] **Step 1: Add the admin `report` handler**

Append to `src/controllers/admin/users.controller.ts`:

```ts
// Render the printable account statement for a given user (admin view).
export async function report(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      wallet: true,
      investments: { include: { plan: true, tenure: true }, orderBy: { createdAt: 'desc' } },
      transactions: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!user) {
    req.flash('error', 'User not found.');
    res.redirect('/admin/users');
    return;
  }

  const totalInvested = user.investments.reduce((s, i) => s + Number(i.amount), 0);
  const totalExpected = user.investments.reduce((s, i) => s + Number(i.expectedReturn), 0);

  res.render('reports/statement', {
    profileUser: user,
    totalInvested,
    totalExpected,
    generatedAt: new Date(),
  });
}
```

- [ ] **Step 2: Register the admin route**

In `src/routes/admin.routes.ts`, in the Users section (after the `show` route), add:

```ts
router.get('/users/:id/report', adminUsers.report);
```

- [ ] **Step 3: Add the report link on the admin user page**

In `views/admin/users/show.ejs`, change the Investments section heading from:

```html
            <h3>Investments (<%= profileUser.investments.length %>)</h3>
```

to:

```html
            <div class="section-header-row">
              <h3>Investments (<%= profileUser.investments.length %>)</h3>
              <a href="/admin/users/<%= profileUser.id %>/report" target="_blank" rel="noopener" class="btn btn-sm btn-outline-gold">Download / Print Report</a>
            </div>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 5: Verify in the app**

On the preview dev server, as an admin open `/admin/users/:id` and click "Download / Print Report"; confirm `/admin/users/:id/report` opens that user's statement with correct data and prints cleanly.

- [ ] **Step 6: Commit**

```bash
git add src/controllers/admin/users.controller.ts src/routes/admin.routes.ts views/admin/users/show.ejs
git commit -m "Add admin printable statement for any investor"
```

---

## Self-Review Notes

- **Spec coverage:** WS1 → Tasks 1–2; WS2 → Task 3; WS3 → Tasks 4–7; WS4 → Tasks 8–9. All spec sections map to tasks.
- **Type consistency:** `computeTenureChange` (Task 4) signature matches its call in `changeTenure` (Task 5); `changeTenure`'s return shape matches its use in Tasks 6–7; the `statement.ejs` template contract (Task 8) matches both the investor (Task 8) and admin (Task 9) render calls.
- **Known limitation:** the Jest suite is broken independently of this work; a separate follow-up should repair it (flagged to the user). Verification here is `tsx` unit check + `tsc --noEmit` + running-app QA.
```
