# P3 — Sản xuất (lệnh sản xuất, phân công theo tủ, 6 công đoạn, ảnh/vấn đề, cảnh báo chậm/thiếu vật tư)
Specs-Contract: process-first-ready-v1

Roadmap row P3: [docs/development-roadmap.md](../../docs/development-roadmap.md). Host and command conventions as P2 ([plan](../p2-purchasing-warehouse/plan.md), "Command conventions"): Windows, Docker Compose, no `make`, Commands written for Git Bash. Backend paths below are under `backend/src/`.

## Scope decision (GATE-SCOPE — 2026-10-31)
- Existing: order statuses already declare `in_production|delivered|completed` (`plugins/sales/order/enums/order-status.enum.ts:5-11`); demand/shortage/allocation follow one list `DEMAND_BEARING_STATUSES = ['open']` (`plugins/inventory/material/constants/material.constant.ts:5`); issue/return order statuses (`plugins/inventory/issue/constants/issue.constant.ts:21-26`); frontend gates on `open` (`frontend/src/plugins/inventory/issue/components/IssueScreen.tsx:80`, `WorkshopReturnScreen.tsx:36,64`, `material/components/OrderMaterialPage.tsx:45,181,185`); order cancel refuses non-open orders with 409 (`plugins/sales/order/services/order-edit.service.ts:156-161`) and runs the lifecycle `onCancelled` hooks, a failing hook aborting the cancel (`plugins/sales/_shared/ports/order-lifecycle-registry.ts:23-27,37-43`); order line = `tag` + integer `quantity` (`plugins/sales/order/entities/order-line.entity.ts:21-27`); issue lines carry `order_line_id` (`plugins/inventory/issue/entities/stock-issue-line.entity.ts:23`); data scopes, role map and every scope switch (`kernel/shared/services/data-scope.service.ts:18-37,57-70,81-111`; `plugins/crm/_shared/utils/owner-scope.util.ts:14-20`; `plugins/sales/_shared/utils/request-scope.util.ts:15-22`); order list/read port with scope in SQL (`plugins/sales/_shared/ports/order-material-read.port.ts:96,154`); role seed has no production role (`kernel/core/database/seeds/seed-roles.ts:93-218`); notifications: `userIds`, when given, replace the role audience (`kernel/core/audit/notification.service.ts:16-20,365-375`), open-dedupe index (`migrations/1787632241307-notification-open-dedupe-index.ts:15`), so P2 uses one event per audience (`plugins/inventory/material/services/shortage-alert.service.ts:102-110`); upload pattern with 413, `nosniff`, UUID key, lock-and-recount, object cleanup (`plugins/sales/request/request-attachment.controller.ts:61-101`, `services/request-attachment.service.ts:109-134,284-290`); user list needs `*:*` (`kernel/core/users/users.controller.ts:78-80`), feature option endpoints exist (`plugins/sales/request/request.controller.ts:88`); `ScheduleModule.forRoot()` registered, no `@Cron` yet (`app.module.ts:46`); document codes `createWithDocumentCode` (`plugins/sales/_shared/utils/sales-document-code.util.ts:121`); deterministic race helper `queuedBehind`, local to `plugins/inventory/issue/services/issue-race.spec.ts:48-100` (with `waitForWaiters`) (extracted to `kernel/shared/testing/queued-behind.helper-spec.ts` by task-02); landing order (`frontend/src/kernel/core/permissions/landing-path.ts:14-35`).
- Minimum change: one new plugin `production` + two sales ports + an inventory status delta; 8 sequential tasks.
- Expansion signals: >8 files and >2 new services (accepted as one packet, as P2).
- User decision: KEEP, with the seven proposals accepted (user 2026-10-31): (1) six fixed sequential stages; (2) tracking per physical cabinet; (3) roles `productionManager` + `technician`, technician sees assigned cabinets only; (4) one production order per order, release moves the order `open → in_production`, `in_production` keeps demand and issuing, an order is cancelled only after its production order; (5) daily overdue check, notice to productionManager + assignee once per cabinet; (6) shortage never blocks work, shown from P2 and notified to productionManager; (7) PNG/JPEG ≤ 10 MB per cabinet and stage, issues `open → resolved` closed by productionManager, never blocking a stage. Marked "(user)"; GATE-REVIEW answers marked "(user, Qn)".

## Out of scope
- QC checklist, delivery, installation, acceptance (P4); labour hours/timesheets, Gantt or capacity planning, QR on cabinets, configurable stages, partial production orders, production cost (P6).
- Changing order lines after conversion; moving an order to `delivered|completed` (P4); editing an order's delivery date while `in_production` ((user, Q3): stays open-only, `order-edit.service.ts:148`); deleting photos.

## Decisions
| ID | Chosen | Rejected | Why | Load-bearing assumption | Break signal → response |
|---|---|---|---|---|---|
| D-01 | New top-level plugin `production` (features `production-order`, `progress`, `production-issue`), `dependsOn: ['catalog','sales','inventory']`; reaches sales and inventory only through their `_shared` ports | Features inside `inventory` | own module and roles; no cycle | lint `no-cross-plugin-import` allows `_shared` (P2 D-07) | lint error → add a port in `_shared` |
| D-02 | (user) Six fixed sequential stages `material_prep → enclosure → device_mounting → wiring → internal_test → finishing` (vi: Chuẩn bị vật tư, Gia công vỏ tủ, Lắp thiết bị, Đấu dây, Kiểm tra nội bộ, Hoàn thiện/đóng gói); stage statuses `pending → in_progress → done`; stage k starts only when k−1 is `done`. (user, Q4) Undo: productionManager only, the latest `done` stage of a unit whose next stage is `pending`, with reason → `in_progress`; an undo on a `completed` production order → 409 | Configurable stages | user | — | — |
| D-03 | (user) One `production_unit` per physical cabinet: per order line, `quantity` units coded `<tag>-<n>`, snapshot of tag/description and `order_line_id`; six stage rows per unit | Per order line | user | order lines never change (P1 D-04) | — |
| D-04 | (user) Production order `LSX_YYYY_NNNN`, statuses `draft → released → completed`, `cancelled` (reason) from `draft|released`; ≤ 1 non-cancelled per order (partial unique `(order_id) WHERE status <> 'cancelled' AND is_deleted = false`); created only from an `open` order; never deleted. (user, Q2) Release requires every unit to have an assignee and a planned end date, else 400 listing the unit codes. Release: order `open → in_production`. (user, Q1) Cancel of a released order is allowed with a reason even after stages were done; stage history stays; order `in_production → open`. Auto `completed` when every unit's `finishing` is `done` (order stays `in_production` until P4). (R-01) An order with a non-cancelled production order cannot be cancelled: production registers `onCancelled` on `OrderLifecycleRegistry` and throws 409, aborting the cancel | Auto-cancelling a draft | user (4): order cancelled only after its production order | — | — |
| D-05 | Sales port `OrderProductionPort` (`sales/_shared/ports/`): `lockForProduction(manager, orderId)` = order `FOR UPDATE` → id/code/status/lines; `moveStatus(manager, orderId, from, to)` = `UPDATE … WHERE status = :from` (0 rows → 409); `ownerScopeCondition(actor)` = SQL condition over the order's current request owner (as `order-material-read.port.ts:96`), never a snapshot (R-05). Global lock order: order `FOR UPDATE` → production order header `FOR UPDATE` → unit rows `FOR UPDATE` ascending id. (R-10) **Every** write on a unit or its stages, photos or issues (assign, reassign, plan date, start, finish, undo, photo, issue) takes header `FOR UPDATE` → unit `FOR UPDATE` and re-checks header status, actor (assignee or productionManager) and expected stage status on the locked rows. No production path takes a stock balance lock | Production writing `sales_orders` directly | lint boundary; one writer; serialisation | — | "deadlock detected" → find the inverted acquisition, never retry |
| D-06 | `in_production` added to `DEMAND_BEARING_STATUSES`, `ISSUABLE_ORDER_STATUSES`, `RETURNABLE_ORDER_STATUSES` in **task-02**, before any order can reach `in_production` (R-14); the frontend gates (`IssueScreen.tsx:80`, `WorkshopReturnScreen.tsx:36,64`, `OrderMaterialPage.tsx:45,181,185`) follow the same lists in task-04 (R-04) | Releasing reservations on release | (user) demand and issuing continue | backend lists are the only backend gates (reviewer caller inventory 2026-10-31) | another `'open'` literal gating demand/issue → add to the owning task |
| D-07 | Roles (user): `productionManager`, `technician`. Data scopes: productionManager → `material`; technician → new `assignedTechnician`, which matches nothing in every sales-chain and material switch (`owner-scope`, `request-scope`, `materialListCondition` → `{salesOwnerId: NO_OWNER_ID}`, `canSee`/`canSeeMaterial` → false) (R-07). Production reads, scope × endpoint (R-05): `all`/`material` → every production order, unit, photo, issue, shortage; `ownSales` → those of orders whose current owner is the actor (SQL via `ownerScopeCondition`); `assignedTechnician` → production orders with ≥ 1 unit assigned to the actor, detail lists only their units, units/photos/issues only of their units, shortage of such orders; anything else 404. (user, Q5) productionManager may reassign any unit whose `finishing` is not done; the old assignee loses access at commit | Technician sees all | user (3) | — | — |
| D-08 | Permission modules `production_order` (`read|create|update|release|cancel`), `production_progress` (`read|update|undo`), `production_issue` (`read|create|resolve`). Grants: productionManager all three `*` + `material:read` + `stock:availability`; technician `production_order:read`, `production_progress:read|update`, `production_issue:read|create`; director, salesManager `production_order:read`, `production_progress:read`, `production_issue:read`; sales `production_order:read`, `production_progress:read`. No production response carries a D-19 money key (`kernel/shared/testing/money-keys.helper-spec.ts`) | — | no sales money in production | re-seed updates only roles never edited by an admin (P2 D-08) | a role in {director, salesManager, sales, productionManager, technician} with `updated_by` set → grant manually, note in the receipt (R-08) |
| D-09 | Stage transitions by the assignee or a productionManager, only while the header is `released`, under D-05 locks with `WHERE status = :expected`; the last `finishing` done completes the production order in the same transaction | Unit lock only | two last units finishing together complete it exactly once | — | — |
| D-10 | (user) Photos (R-09): PNG/JPEG, extension and magic bytes must agree (PNG `89 50 4E 47`, JPEG `FF D8 FF`), > 10 MB → 413 (multer limit, as request attachments), ≤ 30 per unit counted under D-05 locks (31st → 400); key `production/<unitId>/<uuid>.<ext>`; display name sanitised in production; the stored object is deleted when the transaction fails; optional `issueId` must belong to the same unit (else 400); content route streams with the stored content type (never the client's) and `X-Content-Type-Options: nosniff`; no storage key in any response | Moving the request upload utils to the kernel | no change to sales | — | — |
| D-11 | (user) Issue: unit, stage, description ≤ 2000, severity `low|medium|high`, photos; `open → resolved` (resolution) by productionManager only; open issues never block stages | — | user (7) | — | — |
| D-12 | (user) Overdue (R-11): unit `planned_end_date`; one helper `vnToday(now)` (Asia/Ho_Chi_Minh) used by the job and by every planned-date comparison. `@Cron('0 7 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })` plus one run at `onApplicationBootstrap` (catch-up; idempotent through dedupe). Per candidate unit one transaction: unit `FOR SHARE`, re-check header `released`, `finishing` not done, `planned_end_date < today`, then emit inside it. Single backend instance (compose) | Overdue checked on read only | user (5) | one instance | several instances → Bull repeatable job |
| D-13 | (user) Shortage: `inventory.order.short` audience gains `productionManager` (`shortage-alert.service.ts:102`); a migration appends it to `role_codes` of every **open** `inventory.order.short` record (R-13). Production screens show per-item short through `inventory/_shared/ports/order-shortage.port.ts`, which calls the existing `MaterialService` computation (extracted to a shared util if needed), never a second formula (R-15). Nothing blocks | A separate production shortage event | one notice, one formula | — | — |
| D-14 | Notifications after commit, one event type per audience (R-02), dedupe per subject; activity rows in `production_order_events`. (user, Q6) Events: `production.order.released` (users: assignees) + `production.order.released.owner` (user: sales owner); `production.order.cancelled` + `.owner` (same audiences); `production.unit.assigned` (user: new assignee); `production.order.completed` (role productionManager) + `.owner` (sales owner); `production.issue.opened` (role productionManager); `production.issue.resolved` (user: reporter); `production.unit.overdue` (role productionManager) + `production.unit.overdue.assignee` (user: assignee), dedupe `unit:<id>`, both released on finishing done, cancel, re-plan to ≥ today, and reassignment (assignee notice only). A failed notice never undoes the commit | Role + users on one record | kernel: users replace roles | — | — |

## Coverage profile
| ID | Outcome | Change kinds | Material surfaces | Ambiguity/action | Risk/evidence | Required proof |
|---|---|---|---|---|---|---|
| CP-01 | Production roles, permissions, `assignedTechnician` scope, demo accounts | add, modify | data, security | none | critical (privilege) | source |
| CP-02 | Production order backend: units, assign, release/cancel, order status, order-cancel veto, inventory status lists | add, integrate, modify | data, API, async | none | critical (cross-plugin tx, concurrency) | source (real Postgres) + P2 regression |
| CP-03 | Production order UI and entry points | add | UI | none | elevated | source |
| CP-04 | Inventory UI follows `in_production`; shortage shown and notified to productionManager | modify | UI, API, data | none | elevated (P2 regression) | source (real Postgres) + P1/P2 e2e regression |
| CP-05 | Six-stage tracking, technician scope, undo, auto completion | add | data, API, UI, async | none | critical (concurrency, scope) | source (real Postgres) |
| CP-06 | Photos and issues | add | data, API, UI, filesystem/security | none | elevated (upload) | source (real Postgres) |
| CP-07 | Daily overdue alert | add | async, time | none | elevated (time zone, races) | source (real Postgres) |
| CP-08 | HTTP chain e2e | add | integration | none | critical | source + live (e2e on compose Postgres) |

## Acceptance criteria
| ID | EARS criterion | Proof |
|---|---|---|
| AC-01 | The seeded matrix shall follow D-08 and seed one demo `productionManager` and two demo `technician` accounts; both roles shall see no sales-chain record and technicians no material record. | task-01 |
| AC-02 | When a productionManager creates a production order from an `open` order, the system shall create one unit per cabinet coded `<tag>-<n>` with six `pending` stages; a second non-cancelled one or a non-open order → 409. | task-02 |
| AC-03 | When a production order is released (every unit assigned and dated, else 400), the order shall become `in_production` in the same transaction; cancelling it shall return the order to `open`; cancelling an order that has a non-cancelled production order → 409; release ∥ order cancel → exactly one succeeds. | task-02 |
| AC-04 | While an order is `in_production`, its demand, reservation, shortage, issue and workshop return shall behave as for `open`, in the API and in the inventory screens. | task-02, task-04 |
| AC-05 | When an order bearing a production order is short, production screens shall show the short items and the shortage notice (also one already open) shall be readable by productionManager. | task-04 |
| AC-06 | A stage shall start only after the previous is done, only by the current assignee or a productionManager on a released order (re-checked under lock); undo per D-02; the last `finishing` done shall complete the production order exactly once, also under concurrency. | task-05 |
| AC-07 | Production reads shall follow the D-07 scope × endpoint table (technician sees only own units, also inside a production order detail; sales only current own orders; others 404). | task-01, task-02, task-05, task-06 |
| AC-08 | When a photo is uploaded, the system shall follow D-10 (413 over 10 MB, 400 on wrong content, 31st or foreign issue; nosniff; no storage key) and serve it only to actors who can read the unit. | task-06 |
| AC-09 | When an issue is opened, productionManager shall be able to read the notice; only productionManager shall resolve it (403 otherwise); an open issue shall not block a stage. | task-06 |
| AC-10 | When the daily job (or the start-up catch-up) runs, every unfinished unit of a released order past its planned end date (Vietnam date) shall give productionManager and the assignee one readable notice each; finishing, cancelling, re-planning or reassigning shall release them, also when racing the job. | task-07 |
| AC-11 | No production response shall carry a D-19 money key. | task-02, task-04, task-05, task-06, task-08 |
| AC-12 | The chain order → production order → assign → release → issue stock → six stages with photo and issue → completed shall pass over HTTP on a real database. | task-08 |
| AC-13 | A productionManager shall create a production order and assign technicians from the UI without `order:read`; a technician shall land on "Tủ của tôi". | task-03, task-05 |

## Tasks
Strictly sequential (shared registration files, one writer each, as P2).

| # | Task | Priority | Criteria | Primary ownership | Dependencies | Status |
|---|---|---|---|---|---|---|
| 01 | Roles, permissions, `assignedTechnician` scope | P1 | AC-01, AC-07 | seeds, data scope, scope switches | - | done |
| 02 | Production order backend + order veto + inventory status lists | P1 | AC-02, AC-03, AC-04, AC-07, AC-11 | `backend/src/plugins/production/production-order`, `sales/_shared/ports`, inventory constants | 01 | done |
| 03 | Production order UI + entry points | P1 | AC-13 | `frontend/src/plugins/production/production-order`, `OrderMaterialPage.tsx` create button | 02 | done |
| 04 | Inventory UI follows `in_production` + shortage | P1 | AC-04, AC-05, AC-11 | inventory frontend screens, shortage alert, `inventory/_shared/ports` | 03 | done |
| 05 | Six-stage tracking | P1 | AC-06, AC-07, AC-11, AC-13 | `*/src/plugins/production/progress` | 04 | done |
| 06 | Photos + issues | P2 | AC-07, AC-08, AC-09, AC-11 | `*/src/plugins/production/production-issue`, progress photos | 05 | done |
| 07 | Daily overdue alert | P2 | AC-10 | `production/progress` overdue job | 06 | done |
| 08 | Chain e2e | P1 | AC-11, AC-12 | `backend/test/production-chain.e2e-spec.ts` | 07 | done |

Shared registration files (owned by the running task only): plugin catalogs (`backend/src/kernel/platform/plugins/enabled-plugins.ts`, `frontend/src/kernel/platform/plugins/enabled-plugins.ts`, `frontend/src/kernel/platform/features/enabled-feature-keys.ts`), `seed-roles.panel.spec.ts` (PENDING lists, `PANEL_ROLES`), `soft-delete-unique-index.spec.ts`, vi/en permission and notification labels (`frontend/src/kernel/core/hooks/api/useNotifications.ts`), `backend/docs/api/openapi.json` and `frontend/src/kernel/core/api/generated/api.ts` (regenerated as P2 before the Verification Command).

Command conventions: P2 "Command conventions" apply unchanged (migration, seed, seeds + soft-delete specs, "0 skipped", permission-labels run for every task declaring a permission module, `test -f` on every new named probe). Race specs use `queuedBehind` (`backend/src/kernel/shared/testing/queued-behind.helper-spec.ts`, extracted by task-02 from `issue-race.spec.ts`) to force the overlap (R-12); a bare `Promise.all` loop is not a race proof. A task that edits frontend labels or files also runs frontend lint, typecheck and the owning tests.

## Review log
- Round 0 (2026-10-31, author): packet written from the GATE-SCOPE decisions.
- Round 1 (2026-10-31): 3 fresh reviewers (Fact Checker + Contract Verifier; Failure-mode + Assumption; Security + Scope); 24 raw findings deduplicated to R-01…R-15; citations re-run 22 by reviewer + 4 by the author (all current). User: accept all R-01…R-15 and the proposals for Q1–Q6. Repair map:
  - R-01 → D-04 `onCancelled` veto; task-02 Steps (c)(d).
  - R-02 → D-14 one event per audience; task-07; specs read through the actor's notification list.
  - R-03 → task-03 create from `OrderMaterialPage` + open-order picker; task-02 `GET /production/technician-options`.
  - R-04 → D-06; task-04 frontend inventory screens.
  - R-05 → D-05 `ownerScopeCondition`; D-07 scope × endpoint table; task-02 (f).
  - R-06 → task-07 Command uses `src/kernel/core/tests/use-notifications.test.ts`.
  - R-07 → D-07; task-01 Scope/Steps (`materialListCondition`, `canSeeMaterial`, `PANEL_ROLES`, `test -f`).
  - R-08 → D-08 break signal; task-01 Command role list.
  - R-09 → D-10; task-06.
  - R-10 → D-05 unit write locks; task-02 assign race, task-05 reassign ∥ finish race.
  - R-11 → D-12, D-14; task-07.
  - R-12 → Command conventions; tasks 02, 05, 06, 07 race specs.
  - R-13 → D-13 migration; task-04.
  - R-14 → D-06 in task-02.
  - R-15 → task-02 split (03 UI); D-13 single formula; task-05 "Tủ của tôi" first in landing order; Q6.
  - Q1, Q2 → D-04; Q3 → Out of scope; Q4 → D-02, task-05; Q5 → D-07, task-02; Q6 → D-14.
- Sweep 1 (2026-10-31): files reread 9 / deltas 9 (plan rewritten; task-02 split into 02 + 03; old 03–07 renumbered 04–08, five old basenames removed) / stale references fixed: old task numbers, `src/kernel/core/hooks`, `+ 1 byte → 400`, `Promise.all` oracles / conflicts left 0.

### Accepted-repair closure
Fresh closure pass (2026-10-31, read-only reviewer): 13 PASS (R-02, R-09 with notes), 2 PARTIAL (R-10, R-11 → treated as FAIL, open for round 2), 6 new contradictions.

| ID | Decision | Original counterexample | Repaired at | Proved at | Replay | Closure |
|---|---|---|---|---|---|---|
| R-01 | accepted | order cancel with a draft production order succeeds | plan D-04 | task-02 (c), (d) | veto throws inside the cancel tx → 409, order stays open | PASS |
| R-02 | accepted | role + userIds record unreadable by the role | plan D-14 | task-07 Step 1, task-05 (c), task-08 | role branch needs empty `userIds` (`notification.service.ts:362-375`); merged record fails the read | PASS (note: released/assigned read probes missing in task-02) |
| R-03 | accepted | no create entry for productionManager | task-03 Scope; task-02 option endpoints | task-03 Step 2 | material page reachable with `material:read` | PASS |
| R-04 | accepted | inventory screens gate on `open` | D-06; task-04 | task-04 Step 1 | only 5 gates exist; each tested | PASS |
| R-05 | accepted | technician_b sees MSB-1; stale owner | D-05, D-07 | task-02 (f); task-05 (b); task-08 | owner read live via request; snapshot fails "former owner → 404" | PASS |
| R-06 | accepted | vitest path matches no test | task-07 Command | task-07 Command | `use-notifications.test.ts` exists | PASS |
| R-07 | accepted | unowned scope switches | task-01 Scope | task-01 Steps, Command | 5 switches, all owned; `test -f` guards | PASS |
| R-08 | accepted | probe always `0:` | D-08; task-01 Command | task-01 Oracle | 5 roles queried | PASS |
| R-09 | accepted | upload gaps | D-10; task-06 | task-06 Step 1 | each gap probed | PASS (note: random key unprobed; controller spec unguarded) |
| R-10 | accepted | reassign ∥ finish; unit→header deadlock | D-05 | task-02 (e); task-05 (e) | reassign branch discriminated; deadlock branch has no probe that a wrong order would fail | FAIL |
| R-11 | accepted | overdue races, reassign, missed run, UTC date | D-12; task-07 | task-07 Steps | finish race, reassign, bootstrap, job date probed; assign-path `vnToday` and re-plan/cancel/reassign races unprobed | FAIL |
| R-12 | accepted | `Promise.all` does not force overlap | Command conventions | tasks 02, 05, 06, 07 | `queuedBehind` holds the lock and waits for waiters | PASS |
| R-13 | accepted | open shortage notices lack productionManager | D-13; task-04 | task-04 Step 2 | code-only change fails the pre-existing-notice spec | PASS |
| R-14 | accepted | `in_production` before the lists change | D-06; task-02 | task-02 (g) | issue path uses the demand list; (g) fails without it | PASS |
| R-15 | accepted | oversized task, duplicate formula, landing | task-02/03 split; D-13; task-05 | task-04 Step 3; task-05 Step 2 | landing picks first permitted sidebar item | PASS |

- Round 2 (2026-10-31): repairs that enforce accepted decisions, no new user semantics:
  - R-10 → task-05 (h): `PATCH` assign queued behind a stage finish that holds header → unit, and a finish queued behind a `PATCH` holding header → unit; both complete, no deadlock; a PATCH taking unit → header must deadlock (fail).
  - R-11 → task-07 Step 1: assign-path boundary at 2026-11-02T23:30Z (re-plan to 2026-11-02 keeps the notice; a UTC date would release it); re-plan, cancel and reassign each queued against the job's per-unit transaction → no notice left open for the cleared unit.
  - C1 (no lookup by order) → task-02 `GET /production/orders?orderId=`; task-03 uses it.
  - C2 (`queuedBehind` not exportable) → task-02 extracts it to `kernel/shared/testing/queued-behind.helper-spec.ts` and `issue-race.spec.ts` imports it.
  - C3 (`test -f`) → task-04 guards the migration spec, status-list test and new `workshop-return-screen.test.tsx`; task-06 guards `unit-photo.controller.spec.ts` and probes the UUID key.
  - C4 (frontend verify) → task-02 Command runs frontend lint/typecheck and the owning tests (task-01's frontend command later dropped: no role-label map exists); task-02 probes released/assigned reads (R-02 note); task-05 owns `landing-path.test.ts`.
  - C5 → citation `request-attachment.controller.ts:61-101`.
  - C6 (AC-10 races) → covered by the R-11 repair.
- Round-2 closure replay (2026-10-31, fresh read-only reviewer):

| ID | Decision | Original counterexample | Repaired at | Proved at | Replay | Closure |
|---|---|---|---|---|---|---|
| R-10 (a) | accepted | old assignee finishes after reassign | D-05 | task-05 (e) | check before lock lets A finish → probe fails | PASS |
| R-10 (b) | accepted | PATCH unit → header deadlocks with header → unit | D-05; task-05 (h) | — | one contender behind a holder cannot deadlock; probe not discriminating | FAIL |
| R-11 (a) | accepted | assign path uses UTC date | D-12; task-07 | task-07 Step 1 boundary | UTC releases at 23:30Z → probe fails | PASS |
| R-11 (b) | accepted | re-plan/cancel/reassign racing the job | task-07 | task-07 Step 1 races | missing re-check emits for a cleared unit → probe fails | PASS |
| C1 | consistency | no lookup by order | task-02, 03 | task-02 (h) | — | PASS |
| C2 | consistency | `queuedBehind` not exportable | task-02 | task-02 `test -f` + `issue-race.spec.ts` | — | PASS |
| C3 | consistency | missing guards, key unprobed | task-04, 06 | task-04/06 Commands; task-06 key regex | — | PASS |
| C4 | consistency | frontend edits unverified | task-01, 02, 05 | Commands | — | PASS |
| C5 | consistency | nosniff citation | plan | — | task-06 Read still `:61-98` | FAIL |
| C6 | consistency | AC-10 races | task-07 | task-07 Step 1 | — | PASS |

- Post-budget fixes by the controller (paper budget of two rounds used; no fresh replay of these): R-10 (b) → task-05 (h) rewritten to the reviewer's discriminating form `queuedBehind(header, [finish, PATCH])`; C5 → task-06 Read `:61-101`; reviewer contradictions: task-06 owns and tests notification labels; extraction span `issue-race.spec.ts:48-100` with `waitForWaiters`; task-02 Step 2 extracts the helper first; task-01 drops the non-existent frontend role-label map (P2 task-01 receipt) and its frontend command. R-10 (b) and C5 stay unclosed on paper; R-10 (b) is proven only by running task-05 (h) during `/cf:develop`.
- GATE-REVIEW closed (2026-10-31, user): close and promote. R-01…R-15 and C1–C6 closed PASS except R-10 (b) and C5, fixed after the paper budget without a fresh replay; R-10 (b) is an open limitation proven only by task-05 (h) at runtime and re-checked at GATE-DONE. All tasks promoted `blocked` → `pending`; implementation starts only with a new explicit `/cf:develop` invocation.
