# Task 02 — Detail pages have an X back to their parent page

Status: done

## Outcome
Every view screen built on `DetailPageLayout` shows a close (X) icon link in its header that goes to the nearest linked breadcrumb (the list, or the parent record where that is the last linked crumb). Input screens show no X. The request page's "Hủy yêu cầu" button no longer uses an X icon.

## Scope
- In: shared layout derives the target from the last breadcrumb with `href` (excluding the final, current-page crumb); new prop `hideClose` on the layout; `hideClose` set on the six input screens: `IssueScreen`, `WorkshopReturnScreen`, `ReceiveScreen`, `SupplierReturnForm`, `PurchaseOrderCreatePage`, `OrderMaterialPage`; "Hủy yêu cầu" icon `x` → `ban` (`frontend/src/plugins/sales/request/components/RequestDetailPage.tsx:153`).
- Out: unsaved-change prompts; detail pages with inline editors (estimate, stocktake) keep X like any view page.

## Coverage
- CP-02

## Ownership
- Modify: `frontend/src/kernel/core/components/ui/DetailPageLayout.tsx`
- Modify: `frontend/src/plugins/inventory/issue/components/IssueScreen.tsx`, `frontend/src/plugins/inventory/issue/components/WorkshopReturnScreen.tsx`, `frontend/src/plugins/inventory/receipt/components/ReceiveScreen.tsx`, `frontend/src/plugins/inventory/supplier-return/components/SupplierReturnForm.tsx`, `frontend/src/plugins/inventory/purchase-order/components/PurchaseOrderCreatePage.tsx`, `frontend/src/plugins/inventory/material/components/OrderMaterialPage.tsx`
- Modify: `frontend/src/plugins/sales/request/components/RequestDetailPage.tsx`
- Create: `frontend/src/kernel/core/components/ui/tests/detail-page-layout.test.tsx`
- Read: `frontend/src/kernel/core/components/ui/Breadcrumb.tsx`, `frontend/src/kernel/langs/vi/common.json:15` (`common.close`)

## Steps
1. Derive `closeHref` from `breadcrumbs.slice(0, -1)` → last item with `href`, else undefined.
2. Render `Link` from `@/kernel/i18n/navigation` (as `Breadcrumb.tsx:7` does) with the X icon and `aria-label={t("common.close")}` at the header's top-right, beside `actions`; 44px target on mobile; skip when `hideClose` or no `closeHref`.
3. Pass `hideClose` on the six input screens; switch the cancel icon to `ban`.
4. Tests: list crumb → X links to it; parent-record crumb as last linked → X links to it; no linked crumb → no X; `hideClose` → no X.

## Acceptance
- AC-02: the four tests pass.

## Dependencies
- none

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/kernel/core/components/ui/tests/detail-page-layout.test.tsx src/plugins/sales/request src/plugins/inventory"`
- Named probe: `detail-page-layout.test.tsx` (four cases)
- Reachability: frontend container
- Oracle: exit 0
- Counterexample: X linking to the current page, or shown with `hideClose` → test fails
- Artifacts: ephemeral

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/kernel/core/components/ui/tests/detail-page-layout.test.tsx src/plugins/sales/request src/plugins/inventory"
Exit: 0
Base: 55f734047c9e4ebd2670b37d247cf3633a4bbe95
Head: b9fc9e8db63dbe865a6221428f3cad29ccf3f3438d7e215f1878c1f7f661e428
```text
$ docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/kernel/core/components/ui/tests/detail-page-layout.test.tsx src/plugins/sales/request src/plugins/inventory"
 ✓ src/kernel/core/tests/i18n-enum-conformance.test.ts (7 tests)
 Test Files  1 passed (1)
      Tests  7 passed (7)
 ✓ src/plugins/inventory/supplier-return/tests/supplier-return-form.test.tsx (3 tests)
 ✓ src/plugins/inventory/receipt/tests/receive-screen.test.tsx (5 tests)
 ✓ src/plugins/inventory/issue/tests/issue-screen.test.tsx (8 tests)
 ✓ src/plugins/inventory/supplier/tests/supplier-list.test.tsx (4 tests)
 ✓ src/plugins/inventory/material/tests/order-material.test.tsx (12 tests)
 ✓ src/plugins/inventory/stocktake/tests/stocktake-counting.test.tsx (9 tests)
 ✓ src/plugins/sales/request/tests/request-form.test.tsx (8 tests)
 ✓ src/plugins/sales/request/tests/request-list.test.tsx (5 tests)
 ✓ src/plugins/inventory/purchase-request/tests/purchase-request-list.test.tsx (5 tests)
 ✓ src/plugins/inventory/purchase-order/tests/purchase-order-detail.test.tsx (13 tests)
 ✓ src/kernel/core/components/ui/tests/detail-page-layout.test.tsx (4 tests)
 ✓ src/plugins/inventory/material/tests/estimate-vs-actual.test.tsx (3 tests)
 ✓ src/plugins/sales/request/tests/request-attachments.test.tsx (20 tests)
 ✓ src/plugins/inventory/stock/tests/stock-list.test.tsx (6 tests)
 ✓ src/plugins/inventory/issue/tests/workshop-return-screen.test.tsx (4 tests)
 ✓ src/plugins/inventory/material/tests/shortage-notification.test.ts (4 tests)
 ✓ src/plugins/inventory/stock/tests/stock-notification.test.ts (4 tests)
 ✓ src/plugins/sales/request/tests/map-request-api-errors.test.ts (2 tests)
 ✓ src/plugins/inventory/_shared/tests/order-status-gates.test.ts (2 tests)
 ✓ src/plugins/sales/request/tests/request-detail.test.tsx (5 tests)
 Test Files  20 passed (20)
      Tests  126 passed (126)
EXIT=0
```

Final-Head rerun: the Command above was rerun on the final tree after every task in this packet was implemented; the output block is from that run.
