# Task 08 — Stage and cabinet update events carry their data

Status: pending

## Outcome
Stage start, finish and undo events store the stage code in `stage`, and cabinet update events store the assignee name and the planned end date in their own columns, so the history can label them; existing rows are moved to the same shape.

## Scope
- In:
  - Migration in the production-order plugin (real `Date.now()` timestamp), D-07: nullable `assignee_name` (same type as `users.name`) and `planned_end_date date` on `production_order_events`. Backfill, comparing `event::text`:
    - `stage_started`, `stage_finished` with `stage IS NULL` and `reason` one of the six stage codes (`production-stage.enum.ts:3-8`) → `stage = reason`, `reason = NULL`;
    - `stage_undone` with `stage IS NULL` and `reason` matching `^<code>: ` → `stage = <code>`, `reason` = the rest, or NULL when empty;
    - `unit_updated` with `reason` written by `production-order-unit.service.ts:141-148` (`assignee: <name>` and/or `planned end: <yyyy-mm-dd>`, joined by `; `) → the two columns, `reason = NULL`;
    - log the count of rows of these four events left unparsed, leave them as they are.
    `down()` folds the columns back into `reason` in the old formats, then drops the two new columns.
  - Entity gains the two columns; `recordProductionEvent` (`production-order-lock.util.ts:113`) accepts `assigneeName` and `plannedEndDate`.
  - `progress.service.ts:111,127,150`: start and finish pass `stage` and no reason; undo passes `stage` and only the user's reason.
  - `production-order-unit.service.ts:134-150`: passes `assigneeName` (the name, falling back to the id as text as today) when the assignee changed and `plannedEndDate` when the date changed, and no reason.
  - The event view in `production-order-query.service.ts` exposes `assigneeName` and `plannedEndDate` (ISO `yyyy-mm-dd` string).
- Out: rendering (task-09); release, cancel and issue events (unchanged).

## Coverage
- CP-08

## Ownership
- Create: `backend/src/plugins/production/production-order/database/migrations/<timestamp>-add-event-assignee-planned-end.ts`
- Modify: `backend/src/plugins/production/production-order/entities/production-order-event.entity.ts`, `utils/production-order-lock.util.ts`, `services/production-order-unit.service.ts`, `services/production-order-query.service.ts`, `backend/src/plugins/production/progress/services/progress.service.ts`
- Modify (specs): `production-order.service.spec.ts` or `production-order-race.spec.ts` (unit update event), `progress/services/progress.service.spec.ts` (stage events), and a migration spec beside the task-02 one in `production-issue.service.spec.ts` style (scratch schema, rolled back)

## Steps
1. Spec: start, finish and undo a stage → events have `stage` set; start/finish have no `reason`; undo keeps only the typed reason.
2. Spec: change the assignee and the planned end date of a cabinet → one `unit_updated` event with `assignee_name` and `planned_end_date`, no `reason`; the order detail returns them for a production manager.
3. Spec: migration up on old-format rows of the four events (including an unparsable one) → split as above, the unparsable row unchanged; down → the old reasons back.
4. Implement; `npm run validate:migrations` passes.

## Acceptance
- AC-16.

## Dependencies
- task-07-ddl-specs-in-band.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run validate:migrations && npm run migration:run && npm test -- --ci src/plugins/production"`
- Named probe: `progress.service.spec.ts` (stage events), the unit update event spec, the migration up/down spec.
- Reachability: known.
- Oracle: exit 0, 0 skipped.
- Counterexample: keeping `reason: stage` must fail the stage event spec; writing the English `reason` for a cabinet update must fail the unit event spec; a `down()` that only drops columns must fail the down case.
- Artifacts: the live database keeps its migrated rows (demo data stays).

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
