# Task 08 — Bell phrases the new events

Status: pending

## Outcome
The bell renders `sales.order.updated` (one sentence per `change`) and `inventory.stocktake.approved` in Vietnamese and English instead of the fallback text.

## Scope
- In:
  - `useNotifications.ts`: add both event types to `NOTIFICATION_EVENT_KEYS` (`:160-…`) and the phrasing switch (pattern of `sales.order.created`, `:1249-1259`), values `code`, `change`, `reason`, `productionOrderCode`, `issueCode` from the payload written in task-05; `inventory.stocktake.approved` through `INVENTORY_EVENT_MESSAGE_KEYS` (`:125-134`). `NOTIFICATION_REQUIRED_SCOPES` (`:52-122`) stays: every recipient already renders a bell through `material:read` (`:116`; sales, salesManager, purchasing, storekeeper, productionManager hold it) or `stock:read` (`:109`).
  - `common.json` vi/en `events`: `sales_order_updated` with an ICU `select` on `change` (as `production_issue_opened`, vi `:388`) and `other` falling back to a generic sentence; `inventory_stocktake_approved`.
- Out: backend payloads (tasks 04-05).

## Coverage
- CP-07

## Ownership
- Modify: `frontend/src/kernel/core/hooks/api/useNotifications.ts`, `frontend/src/kernel/langs/vi/common.json`, `frontend/src/kernel/langs/en/common.json`
- Create: `frontend/src/kernel/core/tests/sales-order-notification.test.ts`

## Steps
1. Test: each of the six `change` values renders its own vi sentence with the code (and reason / production order code / issue code where present); an unknown `change` renders the generic one; the stocktake event renders with its code; en parity for every key.
2. Implement.

## Acceptance
- AC-12.

## Dependencies
- task-04-self-approval-stocktake.md
- task-05-order-follower-notices.md

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/kernel/core/tests/sales-order-notification.test.ts src/kernel/core/tests/use-notifications.test.ts src/kernel/core/tests/notification-spec-wording.test.ts"`
- Named probe: `sales-order-notification.test.ts` (six changes, unknown change, stocktake).
- Reachability: known.
- Oracle: exit 0; every case renders a sentence from the bundle, never the stored `message`.
- Counterexample: a missing `select` branch must fail its change case; a key only in vi must fail the en render case of `sales-order-notification.test.ts`, which is the only vi/en parity check here (`lint:i18n` checks enum conformance only, `frontend/scripts/check-i18n-enum-conformance.mjs:8-15`).
- Artifacts: none.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
