# Task 03 — Production order UI and entry points

Status: done

## Outcome
A productionManager, without `order:read`, creates a production order from the UI, assigns technicians and planned dates, releases or cancels it; sales reach the production progress of their order from the order detail.

## Scope
- In: frontend plugin `production` registered in the frontend plugin catalog and `enabled-feature-keys.ts`; menu group "Sản xuất". Pages: production order list (filter status), detail (units table: code, assignee picker from `GET /production/technician-options`, planned date, progress placeholder filled by task-05), create dialog with an open-order picker (`GET /production/open-orders`), release dialog (shows the 400 unit list), cancel dialog (reason). Entry points (R-03): "Tạo lệnh sản xuất" button on `OrderMaterialPage.tsx` (gated by `production_order:create`, hidden when `GET /production/orders?orderId=` returns one — then a link to it), and a "Sản xuất" link on `OrderDetailPage.tsx` next to the materials link (`:108`, gated by `production_order:read`). vi/en labels.
- Out: stage UI (task-05); shortage panel (task-04).

## Coverage
- CP-03

## Ownership
- Create: `frontend/src/plugins/production/` (`plugin.ts`, `production.features.ts`, `production-order/`), `frontend/src/app/[locale]/production/`
- Modify: `frontend/src/plugins/inventory/material/components/OrderMaterialPage.tsx` (+ its test), `frontend/src/plugins/sales/order/components/OrderDetailPage.tsx` (+ `tests/order-detail.test.tsx`), `frontend/src/kernel/platform/plugins/enabled-plugins.ts`, `frontend/src/kernel/platform/features/enabled-feature-keys.ts`, vi/en labels

## Steps
1. Plugin registration + list/detail/dialogs → vitest: create through the picker posts `{orderId}`; assignee picker lists technician options; release 400 shows the unit codes.
2. Entry points → vitest: productionManager permissions (no `order:read`) render the create button on the material page; sales sees the "Sản xuất" link on own order detail; a user without `production_order:read` sees neither.

## Acceptance
- AC-13 (productionManager half).

## Dependencies
- task-02-production-order.md

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "test -f src/plugins/production/production-order/tests/production-order-detail.test.tsx && test -f src/plugins/production/production-order/tests/production-order-create.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/production src/plugins/sales/order src/plugins/inventory/material"`
- Named probe: `production-order-detail.test.tsx`, `production-order-create.test.tsx`, `order-detail.test.tsx`, the `OrderMaterialPage` test
- Reachability: known (frontend container, P2 form).
- Oracle: exit 0, 0 skipped.
- Counterexample: placing the create button only on `OrderDetailPage` must fail the productionManager entry test.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T frontend sh -c "test -f src/plugins/production/production-order/tests/production-order-detail.test.tsx && test -f src/plugins/production/production-order/tests/production-order-create.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/production src/plugins/sales/order src/plugins/inventory/material"
Exit: 0
Base: 4bc5b5abae9d0c3b33b9424942378038f8305a37
Head: 992f15880ea7bb629d11b4f2833ef84e371c0747f4915e67aa3c42b96360e809
```text
$ docker compose exec -T frontend sh -c "test -f src/plugins/production/production-order/tests/production-order-detail.test.tsx && test -f src/plugins/production/production-order/tests/production-order-create.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/production src/plugins/sales/order src/plugins/inventory/material"
> panelxerp-frontend@0.1.0 lint
> eslint . --max-warnings=0 && npm run lint:i18n
> panelxerp-frontend@0.1.0 lint:i18n
> node scripts/check-i18n-enum-conformance.mjs
 ✓ src/kernel/core/tests/i18n-enum-conformance.test.ts (7 tests) 5915ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
> tsc --noEmit
 ✓ src/plugins/production/production-issue/tests/issue-list.test.tsx (7 tests) 1811ms
 ✓ src/plugins/inventory/material/tests/order-material.test.tsx (12 tests) 2625ms
 ✓ src/plugins/production/production-order/tests/production-order-detail.test.tsx (19 tests) 4626ms
 ✓ src/plugins/sales/order/tests/order-detail.test.tsx (10 tests) 2395ms
 ✓ src/plugins/production/progress/tests/unit-stages.test.tsx (11 tests) 2018ms
 ✓ src/plugins/inventory/material/tests/estimate-vs-actual.test.tsx (3 tests) 539ms
 ✓ src/plugins/production/production-order/tests/production-order-create.test.tsx (3 tests) 1481ms
 ✓ src/plugins/production/progress/tests/unit-photos.test.tsx (12 tests) 898ms
 ✓ src/plugins/inventory/material/tests/shortage-notification.test.ts (4 tests) 110ms
 ✓ src/plugins/production/progress/tests/module-back-link.test.tsx (1 test) 400ms
 ✓ src/plugins/sales/order/tests/order-notification.test.ts (3 tests) 85ms
 ✓ src/plugins/sales/order/tests/quotation-order-section.test.tsx (7 tests) 779ms
 ✓ src/plugins/production/progress/tests/unit-route-access.test.ts (1 test) 36ms
 ✓ src/plugins/sales/order/tests/map-order-api-errors.test.ts (2 tests) 27ms
 ✓ src/plugins/production/production-order/tests/release-error.test.ts (2 tests) 16ms
 Test Files  15 passed (15)
      Tests  97 passed (97)
```

Notes: two controller runs. Run 1, on the implementer code, exited 0 (45 tests). Review then returned PASS_WITH_WARNINGS with two Medium findings, which the controller fixed:
- `release-error.ts` read the cabinet codes after the last colon, so a tag holding `:` or `,` was split wrongly. It now requires the fixed API prefix and splits on the API's `", "`. The new `release-error.test.ts` covers this with the real nested error envelope.
- Release and cancel did not refresh the material and sales-order caches, so the material page could show a stale order status for up to 60s. `useStoreDetail(true)` now invalidates `materialQueryKeys.all` and `orderQueryKeys.all` for release and cancel.

Run 2 (above) is on the final bytes: exit 0, 47 tests passed, 0 skipped. Re-review: PASS.

Deviations from the task text, accepted in review:
- The unit date field is `plannedEndDate`, the backend DTO name.
- Files outside Ownership, all needed for reachability: `kernel/langs/load-messages.ts` (production bundle), `kernel/platform/plugins/navigation.registry.ts` (sidebar section order) and `kernel/platform/tests/app-navigation.test.ts`.
- Pickers are native `<select>`, which the project already uses.
- The "Sản xuất" link points to `/production/orders?orderId=<id>`.

Open limitations (Low):
- A tag that holds the exact `", "` still splits wrongly. A structured `unitCodes` field would need task-02 reopened.
- The open-order picker has no search and lists 50 orders. The material page entry still reaches the others.
- Each valid `DateInput` parse PATCHes at once. This is untested.
- The detail page shows "not found" for any error, not only 404.
- The release-400 test in `production-order-detail.test.tsx` mocks a flat `{message}` body.
- Events are typed but not rendered.
- Entry links do not check that the production plugin is enabled.

No live UI walkthrough yet. It is planned before GATE-DONE.

Fixed-point rerun (2026-11-03, final Head): exact Command re-run after all later fixes (null refused for a unit's technician and planned end date, planned end dates bounded to 2000-2999 and saved from a draft cell, issue report and resolve recorded in production order history with migration `1793637141727-add-issue-events`, a specific toast when a production order blocks an order cancel, and `onOpenChange` on the shared `DateInput`), exit 0; output above is the summary lines of that run (full log kept in the session scratchpad). Head was identical before and after the run, and both full suites passed in the same run (backend lint + jest 151/151 suites, 1729 tests; frontend lint + typecheck + vitest 172 files passed, 1 skipped, 1406 tests).
