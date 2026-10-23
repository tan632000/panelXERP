# panelXERP — Backend (NestJS)

REST API for panelXERP: master data + Sales module.

## Stack

- NestJS 11 + TypeScript
- PostgreSQL 16 + TypeORM
- Redis + Bull (queue ready)
- JWT Auth + RBAC
- Swagger: `/api/docs`

## Quick start

```bash
cp .env.example .env
npm install
npm run db:migrate   # requires PostgreSQL
npm run db:seed
npm run start:dev
```

API: `http://localhost:8080/api/v1`  
Health: `GET /api/v1/health`

## DB scripts

| Script | Command |
|--------|---------|
| Migrate | `npm run db:migrate` |
| Seed | `npm run db:seed` |
| Reset | `npm run db:reset` |
| Backup | `npm run db:backup` |

Test users after seed: 15 accounts (1 per role). Admin: `admin` / `Admin@123`. Others: `Test@123`. See root `README.md` for full list.

## Module structure (plugin-ready monolith)

```
src/
├── core/          # auth, audit, files, health, users
├── platform/      # plugin.contract, enabled-plugins, events
├── plugins/
│   ├── master-data/   # companies, products, suppliers
│   └── sales/         # rfq, quotation, sales-order
└── common/         # cross-cutting utilities (document-sequence)
```

## Pre-commit

Husky runs ESLint + Prettier on staged `.ts` files.
