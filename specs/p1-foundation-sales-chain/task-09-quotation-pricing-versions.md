# Task 09 — Quotation pricing and versions

Status: done

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

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/sales/quotation && npm run validate:migrations" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/quotation"
Exit: 0
Base: fd51487d40fdd50c9ec76f25d26cead95342f144
Head: f49f0bb50b9609a80392467560a57f93e4854481c1b20d9bdb0786c726aa0d2a
```text
$ docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npx jest --ci src/plugins/sales/quotation && npm run validate:migrations" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/quotation"
> panelxerp-backend@0.0.1 lint
> panelxerp-backend@0.0.1 typecheck
PASS src/plugins/sales/quotation/services/quotation-code.spec.ts (5.246 s)
PASS src/plugins/sales/quotation/services/quotation-pricing.spec.ts
PASS src/plugins/sales/quotation/services/quotation-version.service.spec.ts (8.655 s)
PASS src/plugins/sales/quotation/quotation.controller.spec.ts (18.402 s)
Test Suites: 4 passed, 4 total
Tests:       71 passed, 71 total
> panelxerp-backend@0.0.1 validate:migrations
Migration filename check passed (24 files).
> panelxerp-frontend@0.1.0 lint
> panelxerp-frontend@0.1.0 lint:i18n
 Test Files  1 passed (1)
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
 ✓ src/plugins/sales/quotation/tests/quotation-pricing.test.ts (16 tests) 25ms
 ✓ src/plugins/sales/quotation/tests/request-quotation-section.test.tsx (5 tests) 287ms
 ✓ src/plugins/sales/quotation/tests/quotation-editor.test.tsx (13 tests) 1153ms
 Test Files  3 passed (3)
      Tests  34 passed (34)
Exit: 0
```
No test in the run above was skipped: the real-Postgres revise race in `quotation-version.service.spec.ts` executed. Extra evidence (same Head, not the canonical command): full backend jest 86 suites / 1136 passed; full frontend 135 files passed, 1 skipped / 1103 passed, 6 skipped (permission-labels needs `../backend`); live smoke after migrate + seed + `docker compose restart backend` (statuses/amounts only): estimate with MSB-01 qty 2 at 1 234 567 and DB-02 qty 1 at 500 000 submitted; sales_a creates the quotation 201, code `01-25102026/BG`, draft total at margin 0 = 3 206 665; margins 12.5% / 0.1%, discount 5%, VAT 8% → subtotal 3 278 276, discount 163 914, taxable 3 114 362, VAT 249 149, total 3 363 511 (worked example); the request stays `estimated`; sales_b GET 404 and its list shows 0 rows; second create for the request 409, also after the engineer revises and resubmits the estimate (the draft keeps estimate revision 1 and total 3 363 511); revise a draft 409; discount above subtotal 400; VAT 7 400; engineer lists quotations 403. The smoke script expected 201 for estimate revise, which returns 200 since task-08; that line is a script expectation, not a product failure. Cleanup: smoke quotation, estimate, request (children by cascade) and notifications 15–20 (18–20 from this run, 15–17 orphaned by an earlier smoke whose request was already gone) removed by targeted SQL; item and customer deleted through the API; counts verified 0. Review (code-auditor): round 1 FAIL (Critical: creating a quotation moved the request to `quoted`, outside scope; a pending-module entry for `quotation` weakened the seed typo guard) → request stays `estimated` with one quotation per request, guard narrowed to `PENDING_SCOPES` with a typo fixture → re-review PASS, Low only; controller added the orphaned-pending-scope test for Low #1. Known limitations: revise is reachable only from `pending_approval|approved|rejected`, which only task-10 can produce, so live revise was checked only as 409 from a draft (the success path and race are spec-proven); a draft is not refreshed when a newer estimate revision is submitted; one quotation per request even after cancellation; open questions for task-10 (stale draft on resubmit, cancelling a request with a draft, Revise button, re-quoting after cancel, letterhead config); no browser walkthrough of the UI.
