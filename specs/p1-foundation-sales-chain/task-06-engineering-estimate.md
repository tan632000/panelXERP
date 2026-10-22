# Task 06 — Engineering estimate: BOM per panel and cost estimate

Status: pending

## Outcome
The assigned engineer builds an estimate for a request — one or more panels (tủ), each with BOM lines from the catalog and cost lines — then submits it back to Sales, which is notified.

## Scope
- In: `engineering` plugin. Estimate (code `DT_YYYY_NNNN`, request id, revision no.). Panel (name/tag e.g. `MSB-01`, quantity of identical panels, description). BOM line (catalog item, quantity, unit cost defaulted from item reference price, editable, note). Cost line per panel by category `design`, `labor`, `installation`, `transport`, `other` (amount VND). Totals per panel and estimate. Status `draft` → `submitted`; submitted is read-only; "revise" creates a new draft revision copying the previous one. BOM Excel import per panel (code, qty). Submit emits `engineering.estimate.submitted` → request status `estimated` (via event, no cross-plugin import) + notification to request's sales owner. Engineer time metrics stored: `assignedAt`, `submittedAt` (feeds KPI in P6).
- Out: stock availability and shortage (P2); purchase request (P2); pricing/margin (task-07).

## Coverage
- CP-06

## Ownership
- Create: `backend/src/plugins/engineering/`, `frontend/src/plugins/engineering/`, `frontend/src/app/[locale]/engineering/`
- Modify: both `enabled-plugins.ts`, both `enabled-features`, `seed-roles.ts` (append keys only), `backend/src/plugins/sales/request/listeners/` (add `estimate-submitted.listener.ts`)
- Read: `backend/src/plugins/catalog/` gateway, `backend/src/plugins/sales/_shared/gateways/`

## Steps
1. Entities/migration; money columns `numeric(18,2)` with transformer.
2. Service computes totals server-side (client totals are display only).
3. Submit in a transaction; event after commit; listener in `sales` updates request status and notifies.
4. Revise: copy panels/lines into revision N+1 draft; only the latest submitted revision is quotable.
5. Frontend: estimate editor (panel tabs, BOM grid with item picker, cost lines, totals), submit/revise actions.
6. Specs: totals (2 panels × qty, lines + costs); edit after submit → 409; submit sets request `estimated` and creates one notification for the sales owner; revise copies all lines.

## Acceptance
- AC-07: submitted estimate rejects edits; sales owner notified once.

## Dependencies
- task-04-catalog-plugin.md
- task-05-sales-request.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npx jest --ci src/plugins/engineering src/plugins/sales/request/listeners && npm run validate:migrations && npm run typecheck" && docker compose exec -T frontend npm run typecheck`
- Named probe: `src/plugins/engineering/estimate/services/estimate.service.spec.ts`, `src/plugins/sales/request/listeners/estimate-submitted.listener.spec.ts`
- Reachability: known after task-01.
- Oracle: total fixture = Σ(panel qty × (Σ BOM qty × unit cost + Σ cost lines)) equals the asserted VND value.
- Counterexample: multiplying cost lines without panel quantity must fail the totals assertion.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
