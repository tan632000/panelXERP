# Task 07 — Phân công kỹ sư cho yêu cầu đã có nháp AI thì chuyển Đang dự toán

Status: done

## Outcome
Khi `assign` một request đã có estimate (nháp AI), request chuyển `assigned → estimating` trong cùng transaction; request chưa có estimate giữ hành vi cũ (D-03).

## Scope
- In: nhánh trong `RequestService.assign` (`request.service.ts:443`, move sang `ASSIGNED` tại `:478`): sau khi sang `ASSIGNED`, nếu tồn tại estimate chưa xoá của request thì `advance` tiếp sang `ESTIMATING`; "Đổi kỹ sư" khi đã `estimating` giữ nguyên hành vi hiện tại.
- Out: mọi thay đổi bảng chuyển trạng thái (`assigned → estimating` đã hợp lệ, `request-status-transitions.constant.ts:13`).

## Coverage
- CP-06

## Ownership
- Modify: `backend/src/plugins/sales/request/services/request.service.ts`, `backend/src/plugins/sales/request/services/request.service.spec.ts`, `backend/src/plugins/sales/request/request-fixture.helper-spec.ts` (fake Estimate repo that `assign` now reads)
- Read: `backend/src/plugins/sales/_shared/ports/request-status.port.ts`

## Steps
1. Đọc `assign` và `statusPort.advance` để xác định nơi gắn nhánh.
2. Spec: request `draft` + estimate tồn tại → assign → `estimating`; request `draft` không estimate → `assigned`; request đã `estimating` + đổi kỹ sư → vẫn `estimating`; estimate đã xoá không tính.
3. Spec: thông báo "đã được giao" vẫn gửi đúng một lần cho kỹ sư.

## Acceptance
- AC-08.

## Dependencies
- task-06-ai-prefill-run-api.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run migration:run && npm test -- --ci src/plugins/sales/request"`
- Named probe: `request.service.spec.ts` (Steps 2-3).
- Reachability: known.
- Oracle: exit 0, 0 skipped; status request đúng từng ca; thông báo gửi một lần.
- Counterexample: advance vô điều kiện (kể cả không có estimate) phải làm ca "không estimate" fail.
- Artifacts: không có.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run migration:run && npm test -- --ci src/plugins/sales/request"
Exit: 0
Base: f73351cdfeafff02f1e6a585e2666bfb2f0e44be
Head: dfc18976989e5d93ea273ab0934101aa1e2186e9d83d1522ebc5df697d5e00c5
```text
query: SELECT version()
query: SELECT * FROM current_schema()
query: SELECT * FROM "information_schema"."tables" WHERE "table_schema" = 'public' AND "table_name" = 'migrations'
query: SELECT * FROM "migrations" "migrations" ORDER BY "id" DESC
No migrations are pending
> panelxerp-backend@0.0.1 test
> node scripts/run-tests.js --ci src/plugins/sales/request
PASS src/plugins/sales/request/services/request-attachment.service.spec.ts (7.339 s)
PASS src/plugins/sales/request/services/request-owner-race.spec.ts (7.58 s)
PASS src/plugins/sales/request/services/request.service.spec.ts (8.254 s)
PASS src/plugins/sales/request/request.controller.spec.ts (43.001 s)
Test Suites: 4 passed, 4 total
Tests:       169 passed, 169 total
Snapshots:   0 total
Time:        43.772 s
Ran all test suites matching src/plugins/sales/request.
EXIT=0
```

Review: PASS (code-auditor, one round; 0 Critical/High/Medium, 3 Low: JSDoc line wrap, `hasEstimate` is a count, direct Estimate entity import into request.service.ts).
Limitations: Fakes only: the new count and the assign transaction run on the in-memory fixture, not on a real Postgres or HTTP. Lock ordering (assign locks the request then reads estimates without a lock; the AI writer locks estimate then request) is argued from code under READ COMMITTED, not exercised by a concurrent test; this belongs to the live checks of the final walkthrough task. Request module now imports the Estimate entity directly (no port covers 'has an estimate'); the shared fixture request-fixture.helper-spec.ts was added to Ownership because assign now reads Estimate. An implementer-run mutation proved the no-estimate and deleted-estimate cases fail when advance is unconditional or is_deleted is ignored.
