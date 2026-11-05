# Task 02 — Director bell and role-code gates

Status: done

## Outcome
The director reads every business notification (role broadcasts plus the D-01 allowlist) not raised by them and never a colleague's personal notice, with an unread count that does not grow with one query parameter per record; the director writes estimates like an engineering lead and reads production order history.

## Scope
- In:
  - `notification.service.ts:353-387` (`addressedToActor`), D-01: when `resolveRoleCodes` (`:302-310`) includes `director`, add two branches over `{ isDeleted: false, ...open }` with `excludeUserIds: NOT @> self` and `createdBy: Raw((alias) => \`${alias} IS DISTINCT FROM :creatorId\`, { creatorId: userId })` — an integer parameter, never the jsonb string `self` (`:358`): (a) `userIds: jsonb_array_length = 0` (every role broadcast, any role set); (b) `eventType: In(DIRECTOR_VISIBLE_PERSONAL_EVENTS)` with `userIds` non-empty. Declare `DIRECTOR_VISIBLE_PERSONAL_EVENTS` (`sales.estimate.submitted`, `sales.quotation.rejected`, `inventory.purchase_order.rejected`, `production.issue.resolved`) in the audit module with a comment naming the rule: third-person business events with no broadcast twin.
  - Unread count and mark-all (`:256-266,288-298`) stop loading every readable id into `In()` (`:320-343,442-466`): count unread with one SQL statement over the same branches plus `NOT EXISTS (SELECT 1 FROM notification_reads r WHERE r.notification_id = n.id AND r.user_id = :userId)`, and mark-all with one `INSERT … SELECT … ON CONFLICT DO NOTHING` (or the equivalent if the unique key differs — read the `notification_reads` migration first). Scope matching stays in code only where SQL cannot express it; if `requiredScope` filtering must stay in code, page the ids in batches of at most 1 000 and record that in the Receipt.
  - `notification.service.spec.ts`: its in-memory `find` stand-in (`:38-112`) treats a branch without `recipientId` as a role branch and drops user-addressed rows (`:88`); teach it the two director branches. Change `:316` (old: "a wildcard scope holder still needs an addressed role", director sees 0) → the director (user 4, role `director`) sees the technical broadcast; `:345` (old: "does not substitute for being addressed") → the director still sees 0 for that `po_da_duyet` user-addressed record (not allowlisted); a `*:*` user without the director role (user 6, `:318-320`) sees none.
  - `production-order-query.service.ts:95`: `HISTORY_ROLES` adds `director`; `production-order.service.spec.ts:345-362` moves `director` from the no-history list to the history list.
  - `estimate.service.ts:57-58,443-462`: the writer check accepts `director` beside `engineeringLead`; admin stays out (D-02, confirmed at GATE-REVIEW); the doc comment `:443-447` is corrected. Specs: `estimate.service.spec.ts:212` (director 404 on start) and `:505` (director 404 on every write) → the director writes; admin keeps 404. `estimate.controller.spec.ts:181-200` → director 200, admin 404.
- Out: emit sites (unchanged by D-01); the frontend writer check (task-09).

## Coverage
- CP-02

## Ownership
- Modify: `backend/src/kernel/core/audit/notification.service.ts`, `backend/src/plugins/production/production-order/services/production-order-query.service.ts`, `backend/src/plugins/sales/estimate/services/estimate.service.ts`
- Create: `backend/src/kernel/core/audit/notification-director.db.spec.ts`
- Modify (specs): `kernel/core/audit/notification.service.spec.ts`, `plugins/production/production-order/services/production-order.service.spec.ts`, `plugins/sales/estimate/services/estimate.service.spec.ts`, `plugins/sales/estimate/estimate.controller.spec.ts`
- Read: `backend/src/plugins/production/production-order/production-db.helper-spec.ts:146-240` (a real `NotificationService` on the dev DB, `:196-200`)

## Steps
1. `notification-director.db.spec.ts` (real DB, a real `NotificationService` on the data source as the production harness builds it; deletes its own rows by a unique `payload.probe` value in `afterAll`), as the seeded `director` user with `['*:*']`:
   - emits a `productionManager` broadcast, an allowlisted `production.issue.resolved` to `technician_a`, a `signature_review_rejected` to `sales_a` with a reason, a `sales.request.assigned` to `engineer_a`, a broadcast with `excludeUserIds: [director]`, and a broadcast `createdBy: director`;
   - `listForActor(director)` (filtered by the probe value) holds exactly the first two; `unreadCountForActor` counts them; `markAllRead` marks them; `sales_a` still sees the signature notice.
2. Scale probe in the same spec: insert 70 000 open broadcasts with one `INSERT … SELECT generate_series(…)` tagged with the probe value, then `unreadCountForActor(director)` and `markAllRead(director)` succeed (the old `In(ids)` path exceeds Postgres' 65 535 bind parameters); delete them after.
3. Stand-in spec changes above; history and estimate-writer spec changes above.
4. Implement.

## Acceptance
- AC-02, AC-03 (estimate writes and history).

## Dependencies
- task-01-role-grants.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm test -- --ci src/kernel/core/audit src/plugins/production/production-order src/plugins/sales/estimate"`
- Named probe: `notification-director.db.spec.ts` (allowlist, personal exclusion, own/excluded records, 70 000-row count and mark-all), `notification.service.spec.ts` (`withholds a record whose role set or scope the actor lacks`, `hands a user-addressed record to the named user only`), `production-order.service.spec.ts` (history readers), `estimate.service.spec.ts` (director writes, admin 404).
- Reachability: known.
- Oracle: exit 0, 0 skipped; the director's list is exactly the broadcast and the allowlisted record; the signature notice of `sales_a` is absent from the director's bell; the 70 000-row count returns without error.
- Counterexample: a branch matching every user-addressed record must fail on the signature and assignment notices; a branch keyed on `*:*` instead of the director role must fail the user-6 case; binding `self` to `created_by` must fail the DB spec with an integer syntax error; keeping `In(ids)` for the count must fail the 70 000-row probe; a branch without the `created_by` condition must list the director's own broadcast.
- Artifacts: none; probe rows are deleted.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm test -- --ci src/kernel/core/audit src/plugins/production/production-order src/plugins/sales/estimate"
Exit: 0
Base: a942a6ce71865a539ec305b4b1e28876f376e9b4
Head: 26c257ca7651523ed93d8895c576c401c6f07ec17491b9f4a0929711024fd7ac
```text
$ docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm test -- --ci src/kernel/core/audit src/plugins/production/production-order src/plugins/sales/estimate"
> panelxerp-backend@0.0.1 lint
> eslint "{src,apps,libs,test}/**/*.ts" --max-warnings=0
> panelxerp-backend@0.0.1 typecheck
> tsc --noEmit -p tsconfig.build.json
> panelxerp-backend@0.0.1 test
> node scripts/run-tests.js --ci src/kernel/core/audit src/plugins/production/production-order src/plugins/sales/estimate
PASS src/plugins/sales/estimate/estimate.controller.spec.ts (22.426 s)
PASS src/plugins/sales/estimate/services/estimate.service.spec.ts
PASS src/kernel/core/audit/notification.service.spec.ts
PASS src/plugins/production/production-order/services/production-order.service.spec.ts (32.749 s)
PASS src/kernel/core/audit/notification-director.db.spec.ts (33.012 s)
Test Suites: 12 passed, 12 total
Tests:       160 passed, 160 total
VERIFY_EXIT=0
```

This run started after the last edit; 0 skipped. Named probes: `notification-director.db.spec.ts` (allowlist and personal exclusion; own and excluded broadcasts withheld; the scope rule of the count and mark-all over exact, `module:*`, `*:action`, empty and missing scopes with exact count deltas; 70 000 open broadcasts counted and marked in one statement each), `notification.service.spec.ts`, `production-order.service.spec.ts` (history readers incl. the director), `estimate.service.spec.ts` (director writes, admin 404), `estimate.controller.spec.ts` (director 200, admin 404). After the runs the database held 0 probe notifications and 0 read markers for the director and `technician_a`.

Pre-change run (specs first): exit 1, 10 failed, all on the unmet acceptance (director DB spec 2, notification stand-in 3, estimate service 2, estimate controller 1, history 1) plus one cascade, `answers the open subjects of many dedupe keys with one read`, from a `find` spy left unrestored by the failing count case. Counterexamples (each restored, `cmp` equal): a second director branch without the allowlist fails the DB list case and `shows the director an allowlisted personal event and no other`; the director branches for every user fail the user-6 `*:*` case; `self` bound to `creatorId` fails the DB spec with `invalid input syntax for type integer`; counting through `In(ids)` fails the 70 000-row case (bind message parameter error); no `created_by` condition lists the director's own broadcast; dropping the `module:*` SQL branch fails the scope case (5 expected, 4 received).

Count and mark-all now run as one statement each (`getCount()` over the addressed branches with `NOT EXISTS` on `notification_reads` and the SQL form of `matchesPermission`; `INSERT … SELECT … ON CONFLICT (notification_id, user_id) DO NOTHING RETURNING id`); the list and `markRead` keep the in-code scope filter. Assertion changed outside the listed ones: `counts and marks read on ids and scopes only, never on whole records` → `counts and marks read without loading the readable records` (count and mark-all never call `find`; `markRead` still selects `{id, requiredScope}`). The DB spec runs `ANALYZE notifications` after the bulk insert so the FK check uses a fresh plan.

Review (code-auditor), three rounds: round 1 PASS_WITH_WARNINGS (SQL scope rule untested, `>=` counts, `''` scope mismatch, stale comments, `afterAll` guard) → fixed; round 2 FAIL (the new case left read markers on `technician_a`'s real records; `afterAll` cleaned the director's only) → cleanup extended to both users; round 3 PASS. Open Lows: the scope rule exists twice (code and SQL), now pinned by the DB case; exact count deltas could flake if another DB spec broadcasts to `technician` or `productionManager` between the two counts; cleanup removes the director's and `technician_a`'s read markers created during the run, including any a person makes through the UI meanwhile.
