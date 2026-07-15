# Design: Tier Rename, Admin Totals, Tenure Change & Reports

**Date:** 2026-07-15
**Status:** Approved (pending spec review)

## Context

EPR Access Limited investment platform (Express + EJS + Prisma + Postgres).
Four related changes requested by the business, bundled into one plan:

1. Swap the **Silver** and **Bronze** investment tiers so naming follows the
   conventional Bronze < Silver < Gold < Diamond order. Currently the
   entry-level plan (₦50,000–₦5,000,000, 30%) is named "Silver" and the
   mid-tier plan (₦5,000,001–₦15,000,000, 33%) is named "Bronze" — backwards.
2. Investors currently on the "Silver" plan must become "Bronze" investors and
   vice-versa (handled automatically by #1 — see below).
3. Admin can see an investor's **total investment principal** (all statuses) on
   their account page.
4. Investors (and admins on their behalf) can **change the tenure** of an
   existing investment (e.g. 6 months → 9 months → 1 year & above).
5. Investors can generate a **printable/downloadable report** of their account,
   and admins can generate the same report for any investor.

## Goals

- Correct tier naming everywhere with a single, reversible operation and no
  changes to any investor's money or history.
- Give admins visibility into how much each investor has invested in total.
- Let tenure be changed on active investments without arbitrage or data loss.
- Provide a clean printable statement for investors and admins.

## Non-goals

- No changes to Gold, Diamond, Savings, Fixed Deposit, Trading, Dollar, or Real
  Estate plans.
- No new PDF-generation dependency — reports use browser print / "Save as PDF".
- No retroactive adjustment of referral commissions already paid.
- No schema/migration changes (all four workstreams use the existing schema).

---

## Workstream 1 — Silver ↔ Bronze swap

### Key insight

Every `UserInvestment` references a plan by `planId`. Swapping only the `name`
field between the two `InvestmentPlan` rows relabels them in place: every
investor stays linked to the same row, so an investor on the entry-level row
automatically displays as "Bronze" afterwards, and one on the mid-tier row as
"Silver". This satisfies both requirement #1 and #2 with **zero** changes to
`UserInvestment`, `Transaction`, or `Wallet` records. The amount bands, return
rates, tenures, and durations stay exactly where they are.

**Descriptions are NOT swapped.** Each row's `description` describes its band
(the entry-level row reads "Entry-level plan…"; the mid-tier row reads
"Mid-tier plan…"). The bands never move, so their descriptions must stay with
the row. After the name swap, the entry-level row is named "Bronze" and still
carries the correct entry-level description, and the mid-tier row is named
"Silver" with the mid-tier description. Swapping descriptions would wrongly pair
the new Bronze (entry-level band) with a mid-tier description.

Because only the `name` values are exchanged between the two rows, the *set* of
names in the DB is unchanged — both "Silver – My Investment SPlus" and
"Bronze – My Investment BPlus" still exist, just attached to different bands.
Plan-detail URLs are slugified from the name at request time (see
`pages.controller.ts` `slugify` + `investmentPlanDetail`), so both existing
slugs (`silver-my-investment-splus`, `bronze-my-investment-bplus`) still
resolve — no href changes are needed, only the dropdown order.

### Changes

**A. Live database (one-off script, run manually):**
`prisma/swap-silver-bronze-names.ts`, modelled on the existing
`prisma/set-tier-upper-range.ts`:
- In a single `prisma.$transaction`, swap the `name` (only — not description)
  between the row whose name contains "Silver" and the row whose name contains
  "Bronze".
- Before/after: print both rows' name, min, max, returnRate.
- Print the email of every investor holding each of the two plans, so the
  operator can cross-check against the known list of affected Silver investors.
- Idempotent-safe to reason about: re-running swaps them back (symmetric).
- Run by the operator (not automated in app boot):
  `DATABASE_URL="<live proxy url>" npx tsx prisma/swap-silver-bronze-names.ts`

**B. Hardcoded display order (code — not DB-driven):**
- `src/utils/helpers.ts` — `PLAN_DISPLAY_ORDER`: change
  `['Silver', 'Bronze', ...]` → `['Bronze', 'Silver', ...]`.
- `src/controllers/public/chatbot.controller.ts` — `PLAN_ORDER`: change
  `['Save Future', 'Silver', 'Bronze', ...]` → `['Save Future', 'Bronze', 'Silver', ...]`.
- `views/partials/public-nav.ejs` — reorder the two dropdown `<li>` lines so
  "Bronze – Package" is listed before "Silver – Package". The `href` slugs are
  unchanged (both still resolve after a name-only swap).

**C. Seed (keep future re-seeds correct):**
- `prisma/seed.ts` — swap only the `name` strings between the two tier objects
  (the entry-level object, min ₦50,000, becomes "Bronze …"; the mid-tier
  object, min ₦5,000,001, becomes "Silver …"), leaving each object's
  `description`, amounts, rates and tenures in place, so a fresh seed reproduces
  the corrected naming with each band keeping its correct description.

### Verification
- After the script + code changes: home, investment-plans list, plan-detail,
  dashboard investments, and admin views all show the corrected names in the
  right order. The affected investors' rows now read "Bronze"/"Silver" as
  expected.

---

## Workstream 2 — Admin: total investment principal

### Change
In `src/controllers/admin/users.controller.ts` `show()`, compute an aggregate:

```ts
const totalPrincipal = await prisma.userInvestment.aggregate({
  where: { userId: user.id },
  _sum: { amount: true },
});
```

Pass `totalPrincipal` (default 0 when null) to the view.

In `views/admin/users/show.ejs`, render a stat near the wallet balance, e.g.
"Total Invested: ₦X" using the existing `formatCurrency` helper and existing
badge/stat styling.

- **Definition:** sum of `amount` (principal) across **all** the user's
  investments, regardless of status (ACTIVE, MATURED, WITHDRAWN, CANCELLED).
- No schema change.

---

## Workstream 3 — Change tenure of an active investment

### Rules
- Applies only to a `UserInvestment` with `status = 'ACTIVE'` whose plan has one
  or more `PlanTenure` rows.
- New tenure must belong to the same plan.
- Recompute:
  - `expectedReturn = principal × (newTenure.returnRate / 100) + principal`
    (reuse `calculateExpectedReturn`).
  - `maturityDate = originalStartDate + newTenure.durationDays`.
- **Guard (blocks surprise instant payout):** reject the change if the new
  `maturityDate` is in the past or today — that would be effectively an early
  withdrawal, which is out of scope here. Message: the user has already held the
  investment longer than the chosen tenure; pick a tenure that matures in the
  future. Any future-maturing tenure — longer or shorter — is allowed.
- **No arbitrage:** longer tenure → higher rate but later maturity; shorter →
  earlier maturity but lower rate. Neither yields free money.
- Referral commissions already paid at investment creation are **not** adjusted.
- Notify the investor of the change (old tenure → new tenure, new return, new
  maturity).
- When performed by an admin, write an `AuditLog` entry via `logAudit`
  (action e.g. `INVESTMENT_TENURE_CHANGE`), matching wallet-credit pattern.

### Service
`src/services/investment.service.ts` — new `changeTenure(investmentId, newTenureId)`:
1. Load investment (+ plan + tenures); assert ACTIVE and plan has tenures.
2. Find `newTenure` in the plan's tenures; assert exists.
3. Compute new `maturityDate` from `investment.startDate`; assert future.
4. Update `tenureId`, `expectedReturn`, `maturityDate`.
5. Create investor notification.
6. Return a small summary (old/new tenure labels, new return, new maturity) so
   callers can craft flash/audit messages.

### Controllers & routes
- Investor: `POST /dashboard/investments/:id/change-tenure`
  (`dashboard/investment.controller.ts` → `changeTenurePost`). Verifies the
  investment belongs to `req.session.userId`.
- Admin: `POST /admin/users/:userId/investments/:id/change-tenure`
  (`admin/users.controller.ts` → `changeInvestmentTenure`). Verifies the
  investment belongs to `:userId`; calls `logAudit`.

### UI
- Dashboard *My Investments* table (`views/dashboard/investments.ejs`): in the
  Action column for ACTIVE investments whose plan has tenures, add a
  "Change Tenure" control — a small form/`<select>` of the plan's tenures
  (label + rate) posting to the investor route, with a confirm dialog
  summarising the new rate/return/maturity (CSP-safe listener in the page
  script, matching existing `js-confirm-form` pattern).
- Admin user page (`views/admin/users/show.ejs`): in the Investments table, an
  equivalent "Change Tenure" control per ACTIVE investment posting to the admin
  route. (Requires including each investment's `id`, `tenureId`, and the plan's
  `tenures` — extend the `show()` query's `include`.)

### Data passed to views
`investment.controller.ts index()` already includes `plan` + `tenure` on
`myInvestments`; extend to also include `plan.tenures` (ordered) so the select
can list options. `admin/users.controller.ts show()` currently includes
`investments: { include: { plan: true } }`; extend to
`include: { plan: { include: { tenures: … } }, tenure: true }`.

---

## Workstream 4 — Printable reports

### Approach
One reusable EJS statement template rendered as a standalone, branded document
with print CSS; users print or "Save as PDF" via the browser. No PDF library.

### Template
`views/reports/statement.ejs` (self-contained page — its own minimal layout,
not the dashboard/admin chrome), showing:
- Header: EPR Access Limited name/logo, "Account Statement", generated date/time,
  account holder name + email.
- Wallet balance.
- Investments table: plan (display name), tenure label, amount, expected return,
  start, maturity, status.
- Transactions table: type, amount, reference, date, status.
- Totals: total invested principal (all statuses, matching the admin figure),
  total expected returns, wallet balance.
- A "Print / Save as PDF" button (`window.print()`), hidden in print via CSS.
- Print CSS: white background, black text, hide the button and any nav; page
  breaks avoided inside tables where practical.

### Controllers & routes
- Investor: `GET /dashboard/report` → new
  `dashboard/report.controller.ts` `statement`. Loads the current user with
  wallet, investments (+plan+tenure), transactions; renders the template with a
  `role: 'investor'` context.
- Admin: `GET /admin/users/:id/report` → `admin/users.controller.ts`
  `report`. Loads the target user the same way; renders the same template.
- Link buttons: "Download / Print Report" on the investor dashboard Investments
  page (`views/dashboard/investments.ejs`, near the "My Investments" heading) and
  on the admin user page (`views/admin/users/show.ejs`, near the Investments
  section).

### Data
Reuses existing relations; no schema change. Uses `formatCurrency`,
`formatDate`, `planDisplayName` helpers already available to views.

---

## Cross-cutting: data model impact

None. No Prisma schema changes and no migration. Workstream 1 mutates two
existing rows' text fields via a manual script; the rest are read/aggregate
queries plus updates to existing `UserInvestment` fields (`tenureId`,
`expectedReturn`, `maturityDate`) that already exist.

## Testing

- **Unit (Jest):** `changeTenure` — happy path (return + maturity recomputed
  from start date), rejects non-ACTIVE, rejects tenure from another plan,
  rejects when new maturity is in the past.
- **Manual/preview:** run dev server; verify tier names/order across public +
  dashboard + admin pages; verify admin total-active figure; exercise tenure
  change as investor and as admin (including the past-maturity rejection);
  open both report routes and confirm print layout.
- The Silver↔Bronze DB script is validated by its own before/after console
  output against the known investor list (run by operator).

## Rollout / ordering

Build in this order (each independently shippable):
1. Workstream 1 (code + seed + script). Operator runs the DB script.
2. Workstream 2 (admin total).
3. Workstream 3 (tenure change).
4. Workstream 4 (reports).

Per the user's standing instruction this session: **do not push to git** unless
explicitly asked. Commits may be made locally.

## Risks & mitigations

- *Wrong rows swapped:* script matches by name substring "Silver"/"Bronze" and
  prints before/after for confirmation; symmetric re-run reverts.
- *Tenure-change abuse:* past-maturity guard blocks instant payout; rate follows
  the ending tenure so no arbitrage.
- *Referral drift:* explicitly out of scope; commissions are settled at creation.
- *Report data exposure:* admin report route is behind `isAdminOrStaff`;
  investor report loads only `req.session.userId`.
