# Task 12 — Chạy đủ vòng trên UI thật và cập nhật tài liệu

Status: done



## Outcome
Vòng đầy đủ chạy trên UI thật với demo data giữ lại: template → project chọn template → request + file → Sales bấm AI → kỹ sư được giao verify và gửi → Sales điền giá; tài liệu phản ánh luồng mới.

## Scope
- In:
  - Restart backend/frontend (docker watch không reload), `SEED_SCOPE=all`, chạy kịch bản bằng `agent-browser` (đăng nhập, viewport 1440x1100) theo ghi chú walkthrough: `sales_a` bấm AI trên request có PDF/ảnh thật; `engineer_a` thấy badge, ghi chú, verify, gửi; `sales_a` điền giá và đánh dấu đã điền giá; kiểm tra engineer không thấy giá ở mọi bước.
  - Cập nhật `docs/user-flow-guide.md` (mục dự toán và kịch bản §8), `docs/permission/role-matrix.md` (quyền mới), `docs/development-roadmap.md` (thêm packet).
- Out: sửa tính năng; thêm test mới ngoài kịch bản.

## Coverage
- CP-07

## Ownership
- Modify: `docs/user-flow-guide.md`, `docs/permission/role-matrix.md`, `docs/development-roadmap.md`
- Read: `docs/baogia/*.pdf` (bỏ file `(1)`)

## Steps
1. Xác nhận `ANTHROPIC_API_KEY` có trong môi trường backend (không in giá trị); restart container; `SEED_SCOPE=all npm run seed`.
2. Chạy kịch bản trên UI; chụp ảnh từng bước vào thư mục tạm của scratchpad. Trên DB dev thật, phải chạm cả đường tạo mới lẫn re-run (request `draft`, nháp toàn AI chưa verify) của writer task-06 (khoá `FOR UPDATE/SHARE`, thứ tự khoá estimate rồi request), một lần bấm AI hai lần liên tiếp (unique run → 409), và một run bị sweeper đặt `failed`; ghi kết quả từng ca vào Receipt (phần này task-06 chỉ chứng minh trên fake và trên SQL thô).
3. Ghi các điểm lệch (nếu có) và sửa ở task chủ quản, không sửa trong task này.
4. Cập nhật 3 tài liệu theo kết quả thực tế.

## Acceptance
- AC-14: kịch bản chạy hết, engineer không thấy giá, dữ liệu demo còn lại trong DB.

## Dependencies
- task-07-assign-starts-estimating.md
- task-08-ai-button-ui.md
- task-09-review-mode-ui.md
- task-10-template-ui.md
- task-11-project-template-picker-ui.md
- task-13-openai-adapter.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run migration:run && npm test -- --ci src/plugins/sales src/plugins/crm" && docker compose exec -T frontend sh -c "npx vitest run src/plugins/sales src/plugins/crm"`
- Named probe: walkthrough live bằng `agent-browser` (ghi từng bước + ảnh), cộng hai suite hồi quy trên.
- Reachability: suite known; live cần `ANTHROPIC_API_KEY` — `UNKNOWN` cho tới khi user xác nhận (đây là blocker).
- Oracle: exit 0 hai lệnh; mọi bước walkthrough ra đúng kết quả trong tài liệu; response/DOM của engineer không chứa giá.
- Counterexample: nếu engineer thấy một con số tiền ở bất kỳ bước nào thì walkthrough fail.
- Artifacts: ảnh walkthrough trong scratchpad (tạm, không commit); demo data giữ lại.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run migration:run && npm test -- --ci src/plugins/sales src/plugins/crm" && docker compose exec -T frontend sh -c "npx vitest run src/plugins/sales src/plugins/crm"
Exit: 0
Base: f73351cdfeafff02f1e6a585e2666bfb2f0e44be
Head: 6ac8d15231a067bd6dba4ab50897190001131dab027218db207757c2da439525
```text
-- backend: migration:run + jest src/plugins/sales src/plugins/crm
No migrations are pending
Test Suites: 50 passed, 50 total
Tests:       954 passed, 954 total
Ran all test suites matching src/plugins/sales|src/plugins/crm.
Test Suites: 3 passed, 3 total
Tests:       20 passed, 20 total
Ran all test suites matching ^/app/src/plugins/sales/order/database/bom-item-link\.migration\.spec\.ts$|^/app/src/plugins/sales/quotation/services/quotation-code\.spec\.ts$|^/app/src/plugins/sales/_shared/utils/sales-document-code\.util\.spec\.ts$.
BE_EXIT=0

-- backend seeds (includes the role-matrix doc spec)
Test Suites: 6 passed, 6 total
Tests:       91 passed, 91 total
SEEDS_EXIT=0

-- frontend: npx vitest run src/plugins/sales src/plugins/crm
 Test Files  33 passed (33)
      Tests  271 passed (271)
FE_EXIT=0

-- supplemental: same vitest scope plus src/kernel/langs with backend/src/plugins copied into the frontend container for the run, then removed
 Test Files  34 passed (34)
      Tests  277 passed (277)
VITEST_EXIT=0
ls: /backend: No such file or directory
```

Walkthrough (dev stack, real UI via agent-browser, provider OpenAI gpt-5.6-luna through the Responses API; demo data kept):
- Round 1 (key rejected by Anthropic, HTTP 401): template list with the 5 seeded templates (panels/lines 1/21, 1/9, 1/7, 1/7, 8/127), project with template TPL_0001 and without, request with a PDF, button and confirm dialog, assign without estimate stays `assigned`, two simultaneous POST ai-prefill gave 202 + 409 with one run row (partial unique index), a stuck `running` run (row inserted by hand, 20 minutes old) was set `failed` (AI_TIMEOUT) by the sweeper within about a minute and a new run was accepted.
- Round 2 (OpenAI): first run on YC_2026_0005 succeeded in about 14 s; YC_2026_0006 (text PDF) run 35 s, estimate with 8 lines, assigned afterwards: status went draft -> assigned -> estimating in one action, one `sales.request.assigned` notification; engineer saw AI badge, confidence and note, verified one line then all, got the warning "Còn 7 dòng AI chưa được xác nhận" with "Vẫn gửi", submitted; Sales filled the prices and used the complete-price action; the request stays `estimated`. Re-run on YC_2026_0007 (draft, all-AI unverified) replaced the draft: new succeeded run, still one estimate row, panel replaced, "[AI] " marker not duplicated. Request already estimating/estimated: button hidden, API answers 409; engineer POST answers 403. Scanned PDF LSX-123 on YC_2026_0008: succeeded in about 20 s, 7 catalog lines (qty 3 cabinet), 3 unmatched. LSX-125: 1 panel / 21 lines identical to TPL_0001, no invented part numbers, 10 unmatched items listed with reasons. AI runs 6-10 succeeded; runs 1, 2, 4, 5 failed (old key and the hand-made sweeper row).
- Engineer sees no money: JSON of estimates, requests, templates and the DOM of estimate, request, template and project pages contained no money value, also after Sales priced; AI-written text has no amounts.
- Backend log tail (400 lines) after the runs: no ERROR/WARN lines besides query logging, no Redis/Bull errors.
- Screenshots: scratchpad t12 folder (temporary, not committed).

Review: PASS (code-auditor, round 2; round 1 PASS_WITH_WARNINGS: the status shortcuts 'AI on an assigned request moves it to estimating' and 'assign with an AI draft goes to estimating' were missing in user-flow-guide, the 'catalog' wording covered panels wrongly, the admin-sees-the-button sentence and the roadmap row length were fixed). The walkthrough and regression evidence are the controller's own runs, not the reviewer's.
Limitations:
- Estimate-then-request lock ordering of the writer under real concurrency is exercised only by single sequential runs (create path once, re-run path once), not by a contention test.
- A request already `estimating` with a verified or edited draft was not observed in the UI (the button is hidden and the API answered 409 on an estimating request).
- LocalStack in this compose has no persistence: the controller recreated it on 2026-11-24 at 05:11 (`up --force-recreate backend` also recreated its dependency), so every file uploaded to the dev stack before that is lost while the DB rows remain. Attachment 5 of YC_2026_0005 is such a broken file; the first run on it skipped the file and built the draft from the template (the run status is `succeeded` even then). Files of other modules stored there are also gone (not inventoried).
- The AI confidence is uniformly high (1.00 on the LSX-125 run), so it does not point the engineer at doubtful lines.
- Deviation accepted earlier by the user: the AI button is not hidden when the provider key is missing (503 after the click).
- Provider and model: Anthropic is the default; the live runs used OpenAI gpt-5.6-luna (user decision), and the Anthropic path has never been exercised live.
- Docs updated: docs/user-flow-guide.md, docs/permission/role-matrix.md, docs/development-roadmap.md (the roadmap row says implemented and waiting for the final decision; the user decides completion).
- The first live attempt (round 1) was blocked by an invalid Anthropic key; no data was faked to pass it.
