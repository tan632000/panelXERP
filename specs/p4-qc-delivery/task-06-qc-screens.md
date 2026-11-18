# Task 06 — QC screens and the qcInspector landing

Status: pending

## Outcome
From "QC & Giao hàng" a qcInspector (landing on "Kiểm tra QC") lists cabinets waiting for QC, records a round item by item with notes and photos, and verifies defects fixed by someone else; a productionManager sees "Lỗi QC" and marks defects fixed; sales and storekeeper see QC status read-only; the bell phrases both QC notices.

## Scope
- In: frontend feature `qc-inspection` in `frontend/src/plugins/delivery/qc-inspection/`: list page `/delivery/qc` ("Kiểm tra QC": filters QC status `waiting|failed|passed|not_ready` and order, server paging; columns tủ, mã tủ, lệnh sản xuất, đơn hàng, khách hàng, trạng thái QC); unit page `/delivery/qc/units/[unitId]` (rounds newest first with item results, notes, photo thumbnails; defects with status; "Kiểm tra lần mới" form listing active template items with Đạt / Không đạt / Không áp dụng + note, submit, then per-item photo upload; form shown only with `qc_inspection:create`, on a `waiting|failed` unit with every defect `verified` ((user, Q3)); an empty active template shows a hint instead of the form); defects page `/delivery/qc/defects` ("Lỗi QC": status filter; "Đã khắc phục" with note for `qc_inspection:fix` on `open`; "Xác nhận" for `qc_inspection:verify` on `fixed`, hidden when the current user is `fixedBy` ((user, Q8))). Sidebar items in `delivery.features.ts`: "Kiểm tra QC" first, "Lỗi QC" second, "Mẫu checklist" after (D-15). A 409 "checklist changed" reloads the template and keeps entered results for unchanged items. (R-06) Notification labels for `qc.unit.failed`, `qc.unit.passed` (vi: "Tủ {unitCode} không đạt QC", "Tủ {unitCode} đạt QC, sẵn sàng giao") in `useNotifications.ts` with links, wording in `frontend/src/kernel/langs/{vi,en}/common.json` (`events.*`). `landing-path.test.ts`: a user holding only qcInspector's permissions lands on `/delivery/qc`.
- Out: delivery screens (task-09).

## Coverage
- CP-06

## Ownership
- Create: `frontend/src/plugins/delivery/qc-inspection/**` (feature, components, hooks, services, types, tests `qc-unit-list.test.tsx`, `qc-round-form.test.tsx`, `qc-defects.test.tsx`), `frontend/src/app/[locale]/delivery/qc/page.tsx`, `delivery/qc/units/[unitId]/page.tsx`, `delivery/qc/defects/page.tsx`
- Modify: `frontend/src/plugins/delivery/delivery.features.ts`, `frontend/src/kernel/langs/{vi,en}/delivery.json`, `frontend/src/kernel/langs/{vi,en}/common.json`, `frontend/src/kernel/core/hooks/api/useNotifications.ts` (+ `frontend/src/kernel/core/tests/use-notifications.test.ts`), `frontend/src/kernel/core/tests/landing-path.test.ts`
- Read: `frontend/src/plugins/production/progress/` (unit page, photo thumbnails with revoked object URLs per P3 task-06 receipt), `frontend/src/kernel/core/permissions/landing-path.ts:13-35`, `frontend/src/kernel/core/tests/notification-spec-wording.test.ts`

## Steps
1. List and unit page → `qc-unit-list.test.tsx`: status filter sends `qcStatus`; "Kiểm tra lần mới" hidden without `qc_inspection:create`, on a `passed` unit, and while a defect is not `verified`.
2. Round form → `qc-round-form.test.tsx`: submit blocked until every item has a result; a `fail` without note blocked; the request carries one entry per active item id; a 409 reloads the template and keeps unchanged items' results; photos upload after submit to `/delivery/qc/round-items/:id/photos`; a 413 shows the size message.
3. Defects → `qc-defects.test.tsx`: "Đã khắc phục" only with `qc_inspection:fix` on `open`; "Xác nhận" only with `qc_inspection:verify` on `fixed` and not for the fixer.
4. Labels and landing → `use-notifications.test.ts` phrases both events; `notification-spec-wording.test.ts` and `sales-order-notification.test.ts` stay green; `landing-path.test.ts` qcInspector case.

## Acceptance
- AC-02 (rounds use the active items in the UI); AC-13 (qcInspector and productionManager steps; QC notice wording).

## Dependencies
- task-05-qc-photos-files.md

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "test -f src/plugins/delivery/qc-inspection/tests/qc-unit-list.test.tsx && test -f src/plugins/delivery/qc-inspection/tests/qc-round-form.test.tsx && test -f src/plugins/delivery/qc-inspection/tests/qc-defects.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/delivery src/kernel/core/tests/use-notifications.test.ts src/kernel/core/tests/notification-spec-wording.test.ts src/kernel/core/tests/sales-order-notification.test.ts src/kernel/core/tests/landing-path.test.ts"`
- Named probe: `qc-unit-list.test.tsx`, `qc-round-form.test.tsx`, `qc-defects.test.tsx`, `use-notifications.test.ts` (QC events), `notification-spec-wording.test.ts`, `sales-order-notification.test.ts`, `landing-path.test.ts` (qcInspector → `/delivery/qc`)
- Reachability: known (P3 task-05/06 ran the same frontend form; the wording tests import `common.json` directly, no backend mount).
- Oracle: exit 0, 0 skipped.
- Counterexample: placing "Mẫu checklist" before "Kiểm tra QC" in `delivery.features.ts` must fail the landing spec (qcInspector holds `qc_checklist:read`); showing "Xác nhận" to the fixer must fail the defects test.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
