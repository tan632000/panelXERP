# Task 09 — Delivery note screens and the order's delivery page

Status: pending

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
