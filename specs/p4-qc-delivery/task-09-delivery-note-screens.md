# Task 09 — Delivery note screens and the order's delivery page

Status: done

## Outcome
A storekeeper creates a delivery note by picking an order and its deliverable cabinets, ships it, records the receipt with receiver, date and scanned handover minutes, or cancels it — all from "QC & Giao hàng › Phiếu giao hàng", without `order:read`; anyone with `delivery_note:read` opens an order's delivery page, also from the "Giao hàng" link on the sales order detail page; the bell phrases the new order changes with the note code.

## Scope
- In: frontend feature `delivery-note` in `frontend/src/plugins/delivery/delivery-note/`: list `/delivery/notes` (status filter; columns mã phiếu, đơn hàng, khách hàng, số tủ, trạng thái, ngày nhận); create `/delivery/notes/new` (order picker from `GET /delivery/orders/deliverable`, checklist of deliverable units, planned date, address prefilled from the order data, note); detail `/delivery/notes/[id]` (units, actions by permission and status: "Xuất xưởng", "Khách đã nhận" dialog with receiver name, received date, file input PDF/JPG/PNG 1–5 files, "Huỷ phiếu" with reason; handover files listed and downloaded through the content route); order delivery page `/delivery/orders/[orderId]` in `components/OrderDeliveryPage.tsx` (order code/status, customer, "Dự án", units with QC status and delivery status, notes; installation and acceptance sections are added by task-12). Status labels vi: Nháp, Đã xuất xưởng, Khách đã nhận, Đã huỷ. Sidebar item "Phiếu giao hàng" (`delivery_note:read`) after "Mẫu checklist". `OrderDetailPage.tsx` (`:110-131`): link "Giao hàng" to `/delivery/orders/<id>` for `delivery_note:read` (import from `@plugins/delivery/delivery-note/constants` and `permissions`, allowed by the frontend lint rule). (R-06) Bell: the `sales.order.updated` branch of `useNotifications.ts` (`:1264-1275`) passes `deliveryNoteCode`; `frontend/src/kernel/langs/{vi,en}/common.json` `sales_order_updated` ICU select (`:76`) gains `delivery_received`, `delivered`, `completed` (vi: "Đơn hàng {code}: khách đã nhận phiếu {deliveryNoteCode}.", "Đơn hàng {code} đã giao đủ (phiếu {deliveryNoteCode}).", "Đơn hàng {code} đã nghiệm thu, hoàn thành."). Order status labels `delivered`/`completed` already exist (`frontend/src/kernel/langs/vi/order.json:43-44`).
- Out: installation and acceptance UI (task-12).

## Coverage
- CP-09

## Ownership
- Create: `frontend/src/plugins/delivery/delivery-note/**` (feature, components incl. `components/OrderDeliveryPage.tsx`, hooks, services, types, constants, permissions, tests `delivery-note-create.test.tsx`, `delivery-note-detail.test.tsx`, `order-delivery-page.test.tsx`), `frontend/src/app/[locale]/delivery/notes/page.tsx`, `delivery/notes/new/page.tsx`, `delivery/notes/[id]/page.tsx`, `delivery/orders/[orderId]/page.tsx`
- Modify: `frontend/src/plugins/delivery/delivery.features.ts`, `frontend/src/kernel/langs/{vi,en}/delivery.json`, `frontend/src/kernel/langs/{vi,en}/common.json`, `frontend/src/plugins/sales/order/components/OrderDetailPage.tsx` (+ `frontend/src/plugins/sales/order/tests/order-detail.test.tsx`), `frontend/src/kernel/core/hooks/api/useNotifications.ts` (+ `frontend/src/kernel/core/tests/use-notifications.test.ts`, `frontend/src/kernel/core/tests/sales-order-notification.test.ts`)
- Read: `frontend/src/plugins/production/production-order/components/ProductionOrderCreateDialog.tsx` (order picker pattern, P3 task-03), `frontend/src/kernel/core/tests/notification-spec-wording.test.ts`

## Steps
1. Create screen → `delivery-note-create.test.tsx`: only deliverable units are selectable; submit sends `{orderId, unitIds, …}`; a 400 naming unit codes is shown on the form.
2. Detail → `delivery-note-detail.test.tsx`: "Xuất xưởng" only on `draft` with `delivery_note:ship`; "Khách đã nhận" only on `shipped` with `receive`, submit disabled without receiver, date or file and with more than 5 files; "Huỷ phiếu" on `draft|shipped` with `cancel`, never on `received`; no edit of a draft's units ((user, Q5)).
3. Order page and entry → `order-delivery-page.test.tsx` (storekeeper without `order:read` renders units with both statuses; no money field rendered); `order-detail.test.tsx`: "Giao hàng" link shown with `delivery_note:read`, hidden without.
4. Bell → `sales-order-notification.test.ts` and `use-notifications.test.ts`: the three new changes produce distinct vi/en texts naming the note code; `notification-spec-wording.test.ts` stays green.

## Acceptance
- AC-13 (storekeeper delivery steps; entry from the order; delivery notice wording).

## Dependencies
- task-08-delivery-notes-backend.md

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "test -f src/plugins/delivery/delivery-note/tests/delivery-note-create.test.tsx && test -f src/plugins/delivery/delivery-note/tests/delivery-note-detail.test.tsx && test -f src/plugins/delivery/delivery-note/tests/order-delivery-page.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/delivery src/plugins/sales/order src/kernel/core/tests/use-notifications.test.ts src/kernel/core/tests/notification-spec-wording.test.ts src/kernel/core/tests/sales-order-notification.test.ts src/kernel/core/tests/landing-path.test.ts"`
- Named probe: `delivery-note-create.test.tsx`, `delivery-note-detail.test.tsx`, `order-delivery-page.test.tsx`, `order-detail.test.tsx` (link), `sales-order-notification.test.ts` and `use-notifications.test.ts` (three changes), `notification-spec-wording.test.ts`, `landing-path.test.ts` (storekeeper still lands on its first inventory item)
- Reachability: known (frontend container form as P3; wording tests import `common.json`).
- Oracle: exit 0, 0 skipped.
- Counterexample: gating the order delivery page on `order:read` must fail the storekeeper render case; an ICU select without the `delivered` branch must fail the wording test.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T frontend sh -c "test -f src/plugins/delivery/delivery-note/tests/delivery-note-create.test.tsx && test -f src/plugins/delivery/delivery-note/tests/delivery-note-detail.test.tsx && test -f src/plugins/delivery/delivery-note/tests/order-delivery-page.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/delivery src/plugins/sales/order src/kernel/core/tests/use-notifications.test.ts src/kernel/core/tests/notification-spec-wording.test.ts src/kernel/core/tests/sales-order-notification.test.ts src/kernel/core/tests/landing-path.test.ts"
Exit: 0
Base: 4965d0a49509d70cd8b7d881c9251a1a66762323
Head: 78967b4f22bb1c04e8ff0f157065842313dfa6543b3240f1bb22e7ab97b88316
```text
$ docker compose exec -T frontend sh -c "test -f ...delivery-note-create.test.tsx && test -f ...delivery-note-detail.test.tsx && test -f ...order-delivery-page.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/delivery src/plugins/sales/order src/kernel/core/tests/use-notifications.test.ts ..."
> eslint . --max-warnings=0 && npm run lint:i18n
 Test Files  1 passed (1)
      Tests  7 passed (7)
> tsc --noEmit
 ✓ src/plugins/delivery/delivery-note/tests/delivery-note-create.test.tsx (4 tests)
 ✓ src/plugins/delivery/delivery-note/tests/delivery-note-detail.test.tsx (11 tests)
 ✓ src/plugins/delivery/delivery-note/tests/order-delivery-page.test.tsx (3 tests)
 ✓ src/plugins/sales/order/tests/order-detail.test.tsx (11 tests)
 ✓ src/kernel/core/tests/notification-spec-wording.test.ts (15 tests)
 ✓ src/kernel/core/tests/use-notifications.test.ts (55 tests)
 ✓ src/kernel/core/tests/sales-order-notification.test.ts (22 tests)
 ✓ src/kernel/core/tests/landing-path.test.ts (7 tests)
 Test Files  15 passed (15)
      Tests  171 passed (171)
FINAL_EXIT=0
```
Skipped: none reported in the log. Counterexamples (each run once against a temporary mutation, reverted afterwards; file SHA-256 identical before and after): (1) gating `OrderDeliveryPage` on `order:read` failed `order-delivery-page.test.tsx` "renders the cabinets with both statuses for a reader without order:read" (3 failed of 3); (2) removing the `delivered` branch from the `sales_order_updated` ICU select in vi and en failed `sales-order-notification.test.ts` "phrases the 'delivered' change in Vietnamese" and "…in English" and `use-notifications.test.ts` "words each new order change differently in both languages" (3 failed, 89 passed).
Review: code-auditor PASS (0 critical/high/medium). Low, left as is: both detail pages show "not found" for any load error, not only 404; the create form's inline refusal depends on the backend's English 400 text; the create page has no client-side `delivery_note:create` check (backend returns 403); receipt date has no client-side bounds (backend enforces). Observation: the follower broadcast to the storekeeper is stamped `material:read`, so the bell reaches the storekeeper, but its link goes to `/inventory/materials/<orderId>`, not the new delivery page (backend, outside this task). The auditor did not read `delivery-note-fixtures.tsx` or `DeliveryNoteStatusBadge.tsx`.
Deviations from Ownership: implementation delegated to the implementer agent and verified independently by the controller. A hidden navigation item `/delivery/orders` was added in `delivery-note.feature.ts` (the visible "Phiếu giao hàng" item carries `activeMatch`), because `route-navigation-coverage.test.ts` and `app-navigation.test.ts` require an entry for every route; the "Giao hàng" label lives in `delivery.json` (`orderPage.link`) since `order.json` is outside Ownership. The pre-change run was made by the controller before delegation: the `test -f` check failed (exit 1) because the test files did not exist. Not verified: no live UI walkthrough; `permission-gating-convention.test.ts` timed out once at 5000ms in a larger run outside the Command and passed on a rerun (not root-caused).
Docs impact: none yet (user-facing docs are task-14).
