# Task 08 — Stage and cabinet update events carry their data

Status: done

## Outcome
Stage start, finish and undo events store the stage code in `stage`, and cabinet update events store the assignee name and the planned end date in their own columns, so the history can label them; existing rows are moved to the same shape.

## Scope
- In:
  - Migration in the production-order plugin (real `Date.now()` timestamp, later than `1793721100992`), D-07: nullable `assignee_name VARCHAR(100)` (as `users.full_name`, `1784005029001-init-core.ts:13`) and `planned_end_date DATE` on `production_order_events`. Every event comparison uses `event::text` (the `stage_*` values are added by the progress feature, `1793430128377-add-stage-tracking.ts:19-21`). Backfill:
    - `stage_started`, `stage_finished` with `stage IS NULL` and `reason` one of the six stage codes (`production-stage.enum.ts:3-8`) → `stage = reason`, `reason = NULL`;
    - `stage_undone` with `stage IS NULL` and `reason` matching `^(<code>): (.*)$` (`.` spans newlines in Postgres) → `stage = <code>`, `reason` = the rest, or NULL when it is empty;
    - `unit_updated` whose `reason` is one of the three shapes written by `production-order-unit.service.ts:141-148` — `assignee: <name>`, `planned end: <yyyy-mm-dd>`, `assignee: <name>; planned end: <yyyy-mm-dd>` — → the two columns, `reason = NULL`. The date is anchored at the end of the string, so a name containing `; ` or `: ` stays whole; prove the pattern with the Step 3 rows (Postgres takes a regex's greediness from its first quantifier). A name that is a numeric id (the fallback when no name was found) is kept as that text. No join to `users`.
    - Unparsed rows stay as they are and their count is logged: a stage event with `stage IS NULL`; a `unit_updated` row with `reason IS NOT NULL AND assignee_name IS NULL AND planned_end_date IS NULL`.
  - `down()`, only for rows with `event::text IN ('stage_started','stage_finished','stage_undone','unit_updated')`: stage start/finish → `reason = stage`; undo → `reason = stage || ': ' || coalesce(reason, '')` (an empty undo reason comes back as `"<code>: "`); then `stage = NULL` for those three events; `unit_updated` → `reason = concat_ws('; ', 'assignee: ' || assignee_name, 'planned end: ' || to_char(planned_end_date, 'YYYY-MM-DD'))`; then drop the two columns. Issue events keep their `stage`.
  - Entity gains the two columns; `recordProductionEvent` (`production-order-lock.util.ts:113`) accepts `assigneeName` and `plannedEndDate`.
  - `progress.service.ts:111,127,150`: start and finish pass `stage` and no reason; undo passes `stage` and only the user's reason.
  - `production-order-unit.service.ts:134-150`: passes `assigneeName` (the name, falling back to the id as text as today) when the assignee changed and `plannedEndDate` when the date changed, and no reason.
  - The event view in `production-order-query.service.ts:214-256` (raw SQL) exposes `assigneeName` and `plannedEndDate` as a `yyyy-mm-dd` string through `dateOnly(...)` (`:99-110`) or `::text` in the SQL — never `textOrNull` on the date and never a `Date`, which would shift the day by the time zone.
  - Comments that turn wrong are updated: `production-order-query.service.ts:71` ("null for every other event") and `production-order-event.entity.ts:33` ("The stage code an issue event is about").
- Out: rendering (task-09); release, cancel and issue events (unchanged).

## Coverage
- CP-08

## Ownership
- Create: `backend/src/plugins/production/production-order/database/migrations/<timestamp>-add-event-assignee-planned-end.ts`
- Create (spec): `backend/src/plugins/production/production-order/database/event-data.migration.spec.ts` — runs the migration on a random scratch schema inside a rolled-back transaction with `SET LOCAL search_path` and unqualified table names (the conditions under which task-07 left such a spec out of the in-band group); its scratch table has the `stage` and `severity` columns, or it runs `AddEventStageSeverity1793721100992.up` first.
- Modify: `backend/src/plugins/production/production-order/entities/production-order-event.entity.ts`, `utils/production-order-lock.util.ts`, `services/production-order-unit.service.ts`, `services/production-order-query.service.ts`, `backend/src/plugins/production/progress/services/progress.service.ts`
- Modify (specs): `production-order/services/production-order.service.spec.ts` (unit update event and its view), `progress/services/progress.service.spec.ts` (stage events)

## Steps
1. Spec: start, finish and undo a stage → events have `stage` set; start/finish have no `reason`; undo keeps only the typed reason.
2. Spec: change the assignee and the planned end date of a cabinet → one `unit_updated` event with `assignee_name` and `planned_end_date`, no `reason`; the order detail returns them to a production manager, `plannedEndDate` exactly `'2026-11-20'`.
3. Migration spec, rows for each case: `stage_started` with a code; `stage_started` with `"foo"` (unparsed); `stage_undone` with a reason and with `"<code>: "`; `unit_updated` with assignee only, date only, both, a name containing `; ` and `: `, a numeric id name. Up → split as above, the unparsed row unchanged, the logged count 1; down → every reason back byte for byte, issue events untouched.
4. Migration spec on a scratch enum holding only `created`, `released`, `cancelled`, `unit_updated`: up and down run without error.
5. Implement; `npm run validate:migrations` passes.

## Acceptance
- AC-16.

## Dependencies
- task-07-ddl-specs-in-band.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run validate:migrations && npm run migration:run && npm test -- --ci src/plugins/production"`
- Named probe: `progress.service.spec.ts` (stage events), `production-order.service.spec.ts` (unit update event and view), `event-data.migration.spec.ts` (up/down, edge rows, enum without stage values).
- Reachability: known.
- Oracle: exit 0, 0 skipped; `event-data.migration.spec.ts` appears in the narrowed run.
- Counterexample: keeping `reason: stage` must fail the stage event spec; writing the English `reason` for a cabinet update must fail the unit event spec; comparing `event = '...'` without `::text` must fail the scratch-enum case; a greedy name pattern must fail the combined-row case; returning the date column through `textOrNull` must fail the exact `'2026-11-20'` assertion; a `down()` that only drops columns must fail the down case.
- Artifacts: the live database keeps its migrated rows (demo data stays).

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run validate:migrations && npm run migration:run && npm test -- --ci src/plugins/production"
Exit: 0
Base: e088f943fce05d0378c3b55024899c6ce23f39cc
Head: 78fd084bec77c3f935e1c2749a50ae33cda596e69b6c94ad00412b4cfe866592
```text
$ docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run validate:migrations && npm run migration:run && npm test -- --ci src/plugins/production"
> panelxerp-backend@0.0.1 lint
> eslint "{src,apps,libs,test}/**/*.ts" --max-warnings=0
> panelxerp-backend@0.0.1 typecheck
> tsc --noEmit -p tsconfig.build.json
> panelxerp-backend@0.0.1 validate:migrations
> ts-node -r tsconfig-paths/register scripts/validate-migration-filenames.ts
> panelxerp-backend@0.0.1 migration:run
> npm run typeorm -- migration:run -d src/kernel/core/database/data-source.ts
> panelxerp-backend@0.0.1 typeorm
> ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:run -d src/kernel/core/database/data-source.ts
> panelxerp-backend@0.0.1 test
> node scripts/run-tests.js --ci src/plugins/production
PASS src/plugins/production/progress/services/progress.service.spec.ts (22.336 s)
PASS src/plugins/production/production-order/database/event-data.migration.spec.ts
[Nest] 1543  - 11/04/2026, 6:23:25 PM     LOG [AddEventAssigneePlannedEnd1793810413026] 0 stage event(s) and 0 unit_updated event(s) did not parse and were left unchanged
PASS src/plugins/production/production-order/services/production-order.service.spec.ts (34.269 s)
Test Suites: 14 passed, 14 total
Tests:       135 passed, 135 total
VERIFY_EXIT=0
```

Oracle: exit 0; no skipped line; `event-data.migration.spec.ts` runs in the narrowed run and no second (in-band) summary appears. The diff stat and the hashes of the new files were taken before this run and matched after it. Pre-change run (tests first): lint failed on the specs importing the not-yet-written migration; jest on the three specs alone failed the migration suite (module missing), the unit update case (old English `reason`) and the stage event case (`reason: stage`), 16 others passing. Counterexamples (each file restored and compared): `reason: stage` fails the stage event case; the English cabinet update reason fails the unit event case; `event IN (...)` without `::text` fails the scratch-enum case; a greedy optional-date name pattern fails the combined-row case; the date read through `textOrNull` with no `::text` fails the exact `'2026-11-20'` case (with `::text` kept, `dateOnly` and the cast are two guards and either alone keeps the string); a `down()` that only drops columns fails both migration cases. The live migration logged 0 unparsed rows; the demo stage events now carry `stage`. Review: PASS (code-auditor): no real row can make `::date` throw, because the date was validated by the DTO and written to the unit's DATE column in the same transaction. Open Lows: `startTransaction` outside `try` in the scratch helper (same as the existing spec); `planned_end_date::text` depends on the session `DateStyle` (`to_char` would not); the combined-row case does not separate a non-greedy from a greedy anchored pattern; until task-09, the history shows no text for stage and cabinet update rows.

Rebound: the output above is a rerun of the Command after task-09 changed the frontend; the backend bytes of this task did not change and the Head was the same before and after the run.
