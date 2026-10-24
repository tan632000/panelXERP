# Task 09 — Quotation pricing and versions

Status: pending

## Outcome
Sales creates a priced quotation from the latest submitted estimate, edits margins/discount/VAT, and revises it as versions with complete history; concurrent revisions cannot corrupt versions.

## Scope
- In: `sales/quotation` feature. Quotation (code `NN-ddmmyyyy/BG` per the company format in `docs/BG.xlsx`, e.g. `03-08092026/BG`: two-digit sequence restarting each day in Asia/Ho_Chi_Minh — user decision 2026-10-24; request, estimate revision) + versions (unique `(quotation_id, ver)`), status enum per D-03 `draft|pending_approval|approved|rejected|customer_confirmed|cancelled|closed`; new quotation and each revision start as `draft` (editable: margins, discount, VAT); edits outside `draft` → 409. Code via the shared document-code helper extended with a per-day `NN-ddmmyyyy/BG` format (D-09: retry on unique violation, Vietnam date); spec: two quotations on the same day → `01-…/BG`, `02-…/BG`, next day restarts at `01`. Version lines = estimate panels (tag, description, qty, unit cost, margin%). Pricing per D-10 with `decimal.js`. Revise (only from `pending_approval|approved|rejected`): lock header `FOR UPDATE`, create N+1 copying lines, N → `closed` with `WHERE status = :expected` (D-08). Totals stored on the version. Scope D-12. Permissions `quotation:read|create|update`.
- Out: approval, feedback, PDF (task-10); diff view; Excel export.

## Coverage
- CP-09

## Ownership
- Create: `backend/src/plugins/sales/quotation/` (entities, pricing, version services), `frontend/src/plugins/sales/quotation/`, `frontend/src/app/[locale]/sales/quotations/`
- Modify: `backend/src/plugins/sales/sales.module.ts`, shared registration files listed in plan.md
- Read: `REF/backend/src/plugins/sales/quotation/`

## Steps
1. Entities/migration.
2. Pricing pure functions + worked-example spec.
3. Create-from-estimate and revise services with row lock.
4. Frontend editor with live totals (display only; server is authoritative) and version history list.
5. Specs: worked example; half-up case; revise race with `Promise.all` on real DB → one success, versions unique; revise from `customer_confirmed`/`cancelled` → 409; editing a `pending_approval` version → 409; create from a non-latest estimate revision → 409; Sales B reads Sales A's quotation → 404.

## Worked example (D-10 oracle)
- Panel A: unit cost 1,234,567; margin 12.5% → unit price 1,388,888 (1,388,887.875 half-up); qty 2 → 2,777,776.
- Panel B: unit cost 500,000; margin 0.1% → 500,500; qty 1 → 500,500.
- Subtotal 3,278,276; discount 5% → 163,914 (163,913.8); taxable 3,114,362; VAT 8% → 249,149 (249,148.96); total 3,363,511.
- Half-up probe: unit cost 100, margin 0.5% → 101 (JS float gives 100).

## Acceptance
- AC-10, AC-11.

## Dependencies
- task-08-sales-estimate.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/sales/quotation && npm run validate:migrations" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/quotation"`
- Named probe: `src/plugins/sales/quotation/services/quotation-pricing.spec.ts`, `src/plugins/sales/quotation/services/quotation-version.service.spec.ts`
- Reachability: race spec needs compose Postgres.
- Oracle: worked example numbers exact; race spec: exactly one fulfilled, one rejected with 409.
- Counterexample: `Math.round` on JS numbers must fail the half-up probe.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
