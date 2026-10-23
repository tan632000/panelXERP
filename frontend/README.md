# panelXERP — Frontend (Next.js)

Next.js 16 App Router + Tailwind CSS + TanStack Query.

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

App: http://localhost:3000 → `/login`, then the first screen the account's permissions open (`/profile` while no business plugin is enabled)

## Structure

```
src/
├── app/[locale]/            # Routes: (auth), profile, system; feature routes per plugin
├── kernel/                  # Shared core: api, auth, components, hooks, i18n, langs, platform
├── plugins/                 # Feature plugins (system today; crm, catalog, sales next)
├── test/                    # Vitest setup and helpers
└── types/                   # TypeScript declarations
```

Docker: `../docker/frontend/Dockerfile.dev` | `Dockerfile.prod` (build context = repo root)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |

## Pre-commit

Husky runs ESLint + Prettier on staged files.
