# Task 08 — Delivery notes in batches and the order becoming `delivered`

Status: pending

## Outcome
A storekeeper creates `PGH_YYYY_NNNN` delivery notes from QC-passed, not-yet-delivered cabinets of one order, ships them, records the customer's receipt with the scanned handover minutes, or cancels them; the receipt of the last cabinet moves the order `in_production → delivered` exactly once, releases its reservations and tells the order's followers; production can no longer undo or cancel a cabinet that sits on a delivery note.

## Scope
- In (feature `delivery-note`, D-08): tables `delivery_notes` (code, order_id, status, planned_date, delivery_address, note, shipped_at/by, received_date, receiver_name, received_by, cancel_reason, cancelled_at/by; index on `(order_id)`), `delivery_note_units` (note_id, unit_id, unit code snapshot, `active`; partial unique `(unit_id) WHERE active`), `delivery_note_files`; unique `uq_delivery_notes_code` added to `DOCUMENT_NUMBER_INDEXES` (`soft-delete-unique-index.spec.ts:228-237`); permissions `delivery_note:read|create|ship|receive|cancel`. Endpoints: `GET /delivery/orders/deliverable` (`create`; `in_production` orders with ≥ 1 deliverable unit: code, customer, project name); `GET /delivery/orders/:orderId` (`read`; order code/status/customer/project, prefilled address from `OrderProductionPort.siteAddress`, units with QC status and delivery status `none|draft|shipped|received` + note code, notes); `GET /delivery/notes?status=&orderId=&page=&limit=`, `GET /delivery/notes/:id`; `POST /delivery/notes` `{orderId, unitIds, plannedDate?, deliveryAddress?, note?}` (`create`; `createWithDocumentCode` prefix `PGH`; inside: `lockForProduction` → scope (404) → order status (409) → `ProductionUnitPort.lockOrderUnits` → D-08 checks); `POST /delivery/notes/:id/ship` (`ship`); `POST /delivery/notes/:id/receive` multipart `files[]` (1–5, (user, Q4)), `receiverName`, `receivedDate` (`receive`): (R-02) visibility check (404) before storing → store → transaction order lock → scope → note `FOR UPDATE` → status (409) → (user, Q5) `vnToday()` bounds (400) → rows → count un-received units of the live production order → if 0: (R-08) `moveStatus(in_production → delivered)`, then `lifecycle.delivered(manager, event)`; after commit `pending.afterCommit()` and the D-13 notice; failure deletes every stored object; `POST /delivery/notes/:id/cancel` `{reason}` (`cancel`; (R-15) status and `active=false` in one transaction). (R-03) `GET /delivery/notes/:id/files/:fileId/content` with `delivery_note:read`, `file.note_id = :id` and the D-03 condition in SQL (404 otherwise), stored type, `nosniff`, `Content-Disposition: attachment` (`buildAttachmentContentDisposition`). (R-01) The feature registers on `ProductionGuardRegistry`: `beforeFinishingUndo` and `beforeCancel` → 409 when the unit / any unit of the production order is on a non-cancelled note, independent of QC. Every write takes the order lock first (D-07). `seed-roles.panel.spec.ts`: remove `delivery_note` from `PENDING_MODULES`.
- Out: delivery screens (task-09); installation and acceptance (tasks 10, 11); stock movement, prices.

## Coverage
- CP-08

## Ownership
- Create: `backend/src/plugins/delivery/delivery-note/**` (migration, entities, dto, permissions, `services/delivery-note.service.ts` + `delivery-note.service.spec.ts`, `services/delivery-note-race.spec.ts`, `services/delivery-note-file.service.ts` + `delivery-note-file.service.spec.ts`, `services/delivery-note-guards.ts`, controllers + `delivery-note.controller.spec.ts`, `delivery-note.module.ts`)
- Modify: `delivery.features.ts`, `delivery.module.ts`, `soft-delete-unique-index.spec.ts`, `seed-roles.panel.spec.ts` (PENDING), `frontend/src/kernel/langs/{vi,en}/permission.json`, `backend/docs/api/openapi.json`, `frontend/src/kernel/core/api/generated/api.ts`
- Read: `backend/src/plugins/production/production-order/services/production-order.service.ts:78-86` (code pattern), `backend/src/plugins/sales/request/request-attachment.controller.ts:96-115`, `delivery/_shared/utils/delivery-file.util.ts`, `delivery-scope.util.ts`, task-07 deltas

## Steps
1. Create → `delivery-note.service.spec.ts` (real Postgres): code matches `^PGH_\d{4}_\d{4}$`; a `waiting`/`failed` unit, a unit of another order, a unit on a live draft → 400 naming the codes; an `open`/`delivered` order → 409; sales_b on sales_a's order → 404 before any status answer; no row in `stock_movements` is written by any delivery endpoint; `expectNoMoneyKeys` over every read.
2. Transitions: ship `draft` only; receive `shipped` only, requires `receiverName`, ≥ 1 file and a valid date — (R-12) with `shipped_at = 2026-11-11T18:00Z` (Vietnam date 2026-11-12) `receivedDate 2026-11-11` → 400, `receivedDate = vnToday() + 1` → 400, `2026-11-12` → 2xx; cancel from `draft|shipped` frees the units and (R-15) a new note with the same units then succeeds; cancel `received` → 409; partial receipt keeps the order `in_production` and gives followers `delivery_received` with `deliveryNoteCode`; the last receipt → order `delivered`, followers read one `delivered` notice, no `delivery_received` for that receipt.
3. (R-08) Through the receive endpoint: the delivered order (earliest delivery date) keeps 0 reservations and a short order receives the freed stock; its shortage notice is closed.
4. (R-01) Guards through production endpoints, with the fixture production order kept `released` (another unit's `finishing` still pending, so P3's own `released`-only gates cannot answer 409 first): finishing undo of a unit on a `draft` note and of a unit on a `received` note → 409 even if Q1's QC guard were absent (spec registers only the note guard in an isolated app); production order cancel with a unit on a `shipped` note and with a unit on a `received` note → 409; after the note is cancelled, the note guard no longer objects.
5. Races → `delivery-note-race.spec.ts` (`queuedBehind`, holder holds the `sales_orders` row): two creates naming one unit → one 201, one 400; receipts of the two last shipped notes → both 2xx, order `delivered`, exactly one `delivered` notice; receive ∥ cancel of one note → exactly one succeeds; a direct insert of a second active line for one unit → unique violation (backstop).
6. Files → `delivery-note-file.service.spec.ts`, `delivery-note.controller.spec.ts`: (user, Q4) PNG renamed `.pdf` → 400; 20 MB + 1 byte → 413; 6 files → 400; storage failure after the first of two files → both objects deleted, no row; (R-02) sales_b receive on sales_a's note → 404 and the storage fake's `upload` not called; (R-03) content of another owner's note → 404, `fileId` of another note under `:id` → 404, technician → 403, headers `nosniff` and `Content-Disposition: attachment`; key `^delivery/handover/<noteId>/[0-9a-f-]{36}\.(pdf|png|jpg)$`; no key in responses.
7. Labels, OpenAPI, `api.ts`.

## Acceptance
- AC-05 (note guard), AC-06, AC-07, AC-08; AC-11 (delivery reads, writes, content); AC-12 (handover files).

## Dependencies
- task-07-sales-inventory-deltas.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/delivery/delivery-note/services/delivery-note.service.spec.ts && test -f src/plugins/delivery/delivery-note/services/delivery-note-race.spec.ts && test -f src/plugins/delivery/delivery-note/services/delivery-note-file.service.spec.ts && test -f src/plugins/delivery/delivery-note/delivery-note.controller.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/delivery src/plugins/sales/_shared src/plugins/inventory/material src/plugins/production src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations && npm run test:e2e -- production-chain inventory-chain sales-chain" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts`
- Named probe: `delivery-note.service.spec.ts` (eligibility, transitions, VN dates, order status, reservations, notices, guards, scope, money keys, no stock movement), `delivery-note-race.spec.ts` (create ∥ create, last receipt ∥ last receipt, receive ∥ cancel, backstop), `delivery-note-file.service.spec.ts`, `delivery-note.controller.spec.ts` (413, headers, 403/404); P1–P3 e2e regression
- Reachability: known (same form as P3 task-02/06; `stock_movements` table from P2; task-07 hooks).
- Oracle: exit 0, 0 skipped, three e2e suites passed.
- Counterexample: counting un-received units before the order lock must fail the last-receipt race; calling `lifecycle.delivered()` before `moveStatus` must fail the reservation spec (the order is still demand-bearing when released and re-takes the stock); a UTC date bound must fail the 18:00Z case.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
