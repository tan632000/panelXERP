# Task 10 — Accounting menu and the customer-debt list screen

Status: pending

## Outcome
The frontend `accounting` plugin is registered with the sidebar section "Kế toán"; an accountant lands on "Công nợ khách hàng", a filtered, paged list of orders with their schedule and receivable figures; a sales user with `receivable:read` sees the same list limited to their orders.

## Scope
- In (D-18, D-19): frontend plugin `accounting` (`plugin.ts`, `accounting.features.ts`, feature `receivable` with item "Công nợ khách hàng", `/accounting/receivables`, icon, permissions `receivable:read`, `receivable:*`) registered in `kernel/platform/plugins/enabled-plugins.ts` (`:22-30`) and `kernel/platform/features/enabled-feature-keys.ts` (`:22-31`); `SECTION_ORDER` gains `sidebarAccounting` after `sidebarDelivery` (`navigation.registry.ts:62-69`) and `app-navigation.test.ts` lists it (`:19`); `app/[locale]/accounting/layout.tsx` (`ModuleShell moduleKey="accounting"`) and `app/[locale]/accounting/receivables/page.tsx`; `ReceivableListPage`: filters search, due state (any/upcoming/overdue), balance (open/settled/any), "Chưa lập kế hoạch" toggle (`planned=no`); columns order code, customer, project, order status badge, total, scheduled, invoiced, collected, receivable, next due date (overdue rows highlighted with a text label, not colour alone), page size and pagination as `InstallationListPage`; empty, loading and error states; a row opens `/accounting/orders/<orderId>` (task-11); money formatted with the existing `formatCurrency`; all text in `accounting.json` vi/en (`load-messages.ts`); service and hooks (`receivable.service.ts`, `useReceivables`) typed from the regenerated `api.ts`; no screen text or request needs `order:read`. `receivable.feature.ts` also registers a second, hidden item `{featureKey: "receivable", href: "/accounting/orders", permissions: [receivable:read, "receivable:*"], hidden: true}` and gives the list item `activeMatch: ["/accounting/orders"]`, exactly as `plugins/delivery/delivery-note/delivery-note.feature.ts:13-28` does for `/delivery/orders` (R-02): without it `findNavigationItem` (`kernel/core/permissions/route-permissions.ts:14`) matches no item for `/accounting/orders/<id>` and the module shell refuses the page to a non-administrator. The accountant's landing is the first permitted sidebar item (`landing-path.ts:13-35`), so no landing code changes.
- Out: the order payment screen (task-11); supplier screens (task-12); any write control on this list.

## Coverage
- CP-10

## Ownership
- Create: `frontend/src/plugins/accounting/{plugin.ts,accounting.features.ts}`, `frontend/src/plugins/accounting/receivable/{receivable.feature.ts,constants.ts,types.ts,permissions/receivable-permission.keys.ts,services/receivable.service.ts,hooks/api/useReceivable.ts,components/ReceivableListPage.tsx,tests/receivable-list.test.tsx,tests/accounting-navigation.test.ts}`, `frontend/src/app/[locale]/accounting/{layout.tsx,receivables/page.tsx}`, `frontend/src/kernel/langs/{vi,en}/accounting.json`
- Modify: `frontend/src/kernel/platform/plugins/enabled-plugins.ts`, `frontend/src/kernel/platform/features/enabled-feature-keys.ts`, `frontend/src/kernel/platform/plugins/navigation.registry.ts`, `frontend/src/kernel/platform/tests/app-navigation.test.ts`, `frontend/src/kernel/langs/load-messages.ts`
- Read: `frontend/src/plugins/delivery/installation/components/InstallationListPage.tsx`, `frontend/src/plugins/delivery/delivery.features.ts`, `frontend/src/kernel/core/permissions/landing-path.ts`

## Steps
1. `receivable-list.test.tsx` (vitest): renders rows with figures and the overdue label; each filter changes the request params (`dueState`, `balance`, `planned`, `search`); empty state per filter; error state; a row click navigates to `/accounting/orders/<id>`; the page never calls an order or purchase-order endpoint.
2. Navigation: `app-navigation.test.ts` lists `sidebarAccounting` after `sidebarDelivery`; a permission set of `accountant` (`receivable:*`, `payable:*`) gets landing `/accounting/receivables`; a set without `receivable:read` shows no "Công nợ khách hàng" item.
3. Route admission (AC-20): `accounting-navigation.test.ts` asserts `findNavigationItem("accounting", "/accounting/orders/5")` (also with a locale prefix `/vi/accounting/orders/5`) is not null and is the hidden item with `receivable:read` among its permissions; a `sales` permission set (`receivable:read`) and an `accountant` set (`receivable:*`) pass `hasPermission` on it, an `engineer` set does not; the hidden item is absent from the rendered sidebar.
4. i18n: `accounting.json` vi and en hold identical key sets (`lint:i18n`); Vietnamese wording uses "Công nợ khách hàng", "Đợt thanh toán", "Hóa đơn xuất", "Thu tiền".
5. Live check (recorded in the receipt, after `docker compose restart frontend`): sign in as `accountant_a`, land on the list, see the sidebar section; sign in as `sales_a`, open the list and see only own orders.

## Acceptance
- AC-13 (list part: accountant landing, sales scope via the API, states); AC-11 (UI hides the item without `receivable:read`); AC-20 (route admission).

## Dependencies
- task-09-reminder-wording-bell.md

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/accounting src/kernel/platform src/kernel/core/permissions"`
- Named probe: `receivable-list.test.tsx` (rows, filters, states, navigation, no order endpoint), `accounting-navigation.test.ts` (`/accounting/orders/5` resolves to the hidden item for sales and accountant, not for an engineer), `app-navigation.test.ts` (section order, accountant landing)
- Reachability: known for vitest (compose service `frontend`); the live check needs `docker compose restart frontend`, the demo accounts from task-01 and a seeded plan (created by hand through the API; recorded in the receipt); until the receipt shows it, the live level is open.
- Oracle: exit 0, all files passed, 0 skipped; live: the screenshot-free text observation "landed on /accounting/receivables" and the row count for `sales_a`.
- Counterexample: showing the menu item without `receivable:read` must fail the navigation probe; the list calling `/sales/orders` must fail the no-order-endpoint probe; a highlight by colour only must fail the label probe; omitting the hidden `/accounting/orders` item must make `findNavigationItem` return null and fail the admission probe.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
<!-- Fill only after execution; see canonical form below. -->
