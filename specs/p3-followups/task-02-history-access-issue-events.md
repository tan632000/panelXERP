# Task 02 — History access and issue event data

Status: done

## Outcome
Only a production manager or an admin receives a production order's `events`; issue report and resolve events carry their stage and severity codes as data.

## Scope
- In:
  - `production-order-query.service.ts` returns `events` only when `actor.role` is `productionManager` or `admin` (D-01), otherwise omits the key; `ProductionOrderDetail.events` becomes optional; the event view exposes `stage` and `severity`.
  - Migration in the production-order plugin (real `Date.now()` timestamp): nullable `stage varchar(40)` and `severity varchar(20)` on `production_order_events`; backfill rows with `event::text = 'issue_reported'` by parsing `"<stage>, <severity>: <text>"` into the columns and leaving `<text>` in `reason`; log the count of rows that did not parse; old `issue_resolved` rows stay null. `down()` folds `stage || ', ' || severity || ': ' || reason` back into `reason` for rows with `event::text = 'issue_reported'` that have both, then drops the columns (D-02).
  - `recordProductionEvent` accepts `stage` and `severity`; `production-issue.service.ts` writes them on report (from the dto) and on resolve (from the issue row) and keeps only the description or resolution in `reason`.
- Out: rendering and the frontend type (task-03); OpenAPI (the route has no response schema, `production-order.controller.ts:112-129`).

## Coverage
- CP-02

## Ownership
- Modify: `backend/src/plugins/production/production-order/services/production-order-query.service.ts`, `entities/production-order-event.entity.ts`, `utils/production-order-lock.util.ts`, `backend/src/plugins/production/production-issue/services/production-issue.service.ts`
- Create: `backend/src/plugins/production/production-order/database/migrations/<timestamp>-add-event-stage-severity.ts`
- Modify (specs): `production-order.service.spec.ts` (history by role; `:311` expects the key to be absent instead of `[]`), `production-issue.service.spec.ts` (event columns, backfill, down), `production-order/production-db.helper-spec.ts` (add an `admin` actor to `ACTORS`)

## Steps
1. Spec: sales and director read the order → no `events` key (a storekeeper cannot read a production order at all: 403); productionManager and admin → `events` present; technician → no `events` key.
2. Migration up on a seeded old-format `issue_reported` row → split columns; down → the old reason back.
3. Issue report and resolve → event rows have `stage` and `severity`, and the plain text in `reason`.
4. `npm run validate:migrations` passes; migration up and down run with `ENABLED_FEATURES` lacking `production-issue` on a scratch database or via the spec that runs the migration's SQL against a schema without the issue enum values.

## Acceptance
- AC-05, AC-06.

## Dependencies
- none

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run validate:migrations && npm run migration:run && npm run seed && npx jest --ci src/plugins/production"`
- Named probe: `production-order.service.spec.ts` (history by role), `production-issue.service.spec.ts` (event stage/severity, backfill, down, enum without issue values).
- Reachability: known.
- Oracle: exit 0, 0 skipped.
- Counterexample: returning `events: []` to a storekeeper must fail (key must be absent); comparing `event = 'issue_reported'` must fail the enum-without-values case; a `down()` that only drops columns must fail the down case.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run validate:migrations && npm run migration:run && npm run seed && npx jest --ci src/plugins/production"
Exit: 0
Base: e088f943fce05d0378c3b55024899c6ce23f39cc
Head: 78fd084bec77c3f935e1c2749a50ae33cda596e69b6c94ad00412b4cfe866592
```text
$ docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run validate:migrations && npm run migration:run && npm run seed && npx jest --ci src/plugins/production"
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
> panelxerp-backend@0.0.1 seed
> ts-node -r tsconfig-paths/register src/kernel/core/database/seeds/seed-runner.ts
Test Suites: 14 passed, 14 total
Tests:       135 passed, 135 total
VERIFY_EXIT=0
```

Pre-change run (tests first): the Command exited 1 at lint because the migration did not exist yet; the jest part alone failed only the two history-by-role cases, and the issue suite could not load for the missing migration module. Mutations: `events: []` for non-managers fails both history cases; `event = 'issue_reported'` without `::text` fails the enum-without-values case with `invalid input value for enum`; a down() that only drops columns fails the down case. Review: PASS (code-auditor), Lows recorded for GATE-DONE. This run is on the final bytes (an out-of-scope line-ending rewrite of `production-order.controller.ts` by prettier was reverted before it).

Fixed point: this output is the rerun of the Command on the final bytes of the feature, after every task in it was done.
