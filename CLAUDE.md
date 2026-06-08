# EPR Access Limited — ERP Website

**GitHub:** https://github.com/liwencee/ERP_Website.git

## Project
Investment/fintech platform for Nigerian market. TypeScript · Express · EJS · Prisma · Tailwind CSS · JWT + sessions · Nodemailer · Winston.

## Working directory
`C:\Users\DELL\Pictures\ERP_Website` — always use this as the project root.

## Stack
- **Runtime:** Node.js / TypeScript
- **Framework:** Express 4
- **Views:** EJS templates (`views/`)
- **ORM:** Prisma (`prisma/schema.prisma`)
- **CSS:** Tailwind CSS (`public/css/input.css` → `public/css/output.css`)
- **Auth:** JWT + express-session + bcryptjs
- **Email:** Nodemailer (`src/services/email.service.ts`)
- **Payments:** `src/services/payment.service.ts`
- **Logging:** Winston + daily rotate (`src/utils/logger.ts`)
- **Tests:** Jest + Supertest (`src/__tests__/`)

## Common commands
```bash
npm run dev          # start dev server with hot reload
npm run build        # compile TypeScript + minify CSS
npm run db:migrate   # run Prisma migrations
npm run db:seed      # seed database
npm run db:studio    # open Prisma Studio
npm test             # run all tests
```

## Structure
```
src/
  server.ts                  # entry point
  routes/                    # public, auth, dashboard, admin
  controllers/               # organised by area
  services/                  # email, investment, payment, wallet
  middleware/                # auth, upload, locals
  config/                    # database, email, session
  utils/                     # logger, helpers
  types/index.d.ts
views/                       # EJS templates
prisma/                      # schema + seed
public/                      # static assets, CSS, JS
```
