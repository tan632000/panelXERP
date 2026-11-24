# Task 13 — Adapter OpenAI sau cổng AiClient

Status: done

## Outcome
Backend chạy được AI điền dự toán bằng OpenAI (mặc định model `gpt-5.6-luna`) qua cùng cổng `AiClient`; chọn nhà cung cấp bằng `AI_PROVIDER` (`anthropic` mặc định hoặc `openai`); thiếu key của nhà cung cấp đang chọn → 503 "AI is not configured" như cũ; `compose.yml` không ghi đè key bằng chuỗi rỗng (D-15).

## Scope
- In:
  - `OpenAiAiClient` trong `backend/src/plugins/sales/estimate/ai/` implement `AiClient.extract` (system + khối text/ảnh/PDF → ép gọi đúng một function với JSON Schema của `toolSchema` → trả arguments đã parse); lỗi có kiểu giống `AnthropicAiClient` (chỉ log HTTP status, không log body/header/key; 429 → `AiRateLimitedError`, timeout → `AiTimeoutError`, khác → `AiInternalError`, thiếu function call → `AiOutputInvalidError`).
  - Cấu hình: `AI_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL` (mặc định `gpt-5.6-luna`), giữ `ANTHROPIC_*`; kiểu settings trung tính dùng chung cho service (thay `AnthropicSettings` ở `estimate-ai-prefill.service.ts`); factory trong `estimate.module.ts` chọn client theo `AI_PROVIDER`; `backend/.env.example`; `compose.yml` (bỏ/sửa hai dòng `ANTHROPIC_*` trong `environment:` để không ghi đè `env_file` bằng chuỗi rỗng, thêm các biến mới theo cách không ghi đè).
  - Đối chiếu tài liệu API hiện hành của OpenAI trước khi chọn endpoint và dạng tải lên (Chat Completions hay Responses; cách gửi ảnh và PDF base64; function calling bắt buộc); mọi điểm không kiểm chứng được gắn `[UNVERIFIED]` trong báo cáo.
- Out: đổi prompt/schema/redact (task-02), UI, bỏ Anthropic.

## Coverage
- CP-03

## Ownership
- Create: `backend/src/plugins/sales/estimate/ai/openai-ai.client.spec.ts`, `backend/src/kernel/core/config/ai-provider.config.spec.ts` (approved extra), `backend/src/plugins/sales/estimate/ai/openai-ai.client.ts`, `backend/src/kernel/core/config/ai-provider.config.ts` (nếu gộp được vào `anthropic.config.ts` thì sửa file đó thay vì tạo mới)
- Modify: `backend/src/plugins/sales/estimate/estimate.module.ts`, `backend/src/plugins/sales/estimate/services/estimate-ai-prefill.service.ts` (chỉ kiểu settings), `backend/src/plugins/sales/estimate/services/estimate-ai-prefill.service.spec.ts` (nếu kiểu đổi), `backend/src/kernel/core/config/config.module.ts`, `backend/src/kernel/core/config/anthropic.config.ts`, `backend/.env.example`, `compose.yml`
- Read: `backend/src/plugins/sales/estimate/ai/anthropic-ai.client.ts`, `backend/src/plugins/sales/estimate/ai/ai-client.port.ts`, `backend/src/plugins/sales/estimate/ai/ai-errors.ts`

## Steps
1. Spec (đỏ trước): cấu hình provider (mặc định anthropic; openai khi `AI_PROVIDER=openai`; giá trị lạ → lỗi rõ ràng lúc khởi động hoặc coi như chưa cấu hình, chọn một và test); factory chọn đúng client.
2. Spec `OpenAiAiClient` với `fetch` giả: gửi đúng URL, header `Authorization` Bearer, body có model, hàm bắt buộc và schema; ánh xạ khối text/ảnh/PDF; parse arguments; lỗi 429/timeout/5xx/không có function call ra đúng loại lỗi có kiểu; không log key/body; thiếu key → `AiNotConfiguredError`.
3. Chạy lại spec hiện có của `estimate/ai` và `estimate-ai-prefill.service.spec.ts` không đổi hành vi.
4. `compose.yml`: chứng minh bằng `docker compose config` (không in giá trị key) rằng key trong `backend/.env` không bị ghi đè bằng chuỗi rỗng khi container được tạo lại.

## Acceptance
- AC-16.

## Dependencies
- task-02-ai-extraction-service.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm test -- --ci src/plugins/sales/estimate src/kernel/core/config"`
- Named probe: `openai-ai.client.spec.ts` (Steps 1-2) và spec cấu hình/factory.
- Reachability: known; cuộc gọi OpenAI thật nằm ở walkthrough của task-12 (`UNKNOWN` cho tới đó).
- Oracle: exit 0, 0 skipped; mọi ca lỗi ra đúng lớp lỗi có kiểu; key không xuất hiện trong log.
- Counterexample: log ra body/header upstream hoặc key phải làm Step 2 fail; factory luôn trả Anthropic phải làm Step 1 fail.
- Artifacts: không có.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm test -- --ci src/plugins/sales/estimate src/kernel/core/config"
Exit: 0
Base: f73351cdfeafff02f1e6a585e2666bfb2f0e44be
Head: 9ad6b1e0897e1d6318ec26290cc1b87d4a5bb62f8d9b757cf2c708accb8a15c5
```text
PASS src/plugins/sales/estimate/database/estimate-ai-fields.migration.spec.ts
PASS src/plugins/sales/estimate/database/estimate-pricing.migration.spec.ts
PASS src/kernel/core/config/ai-provider.config.spec.ts
PASS src/kernel/core/config/app.config.spec.ts
PASS src/plugins/sales/estimate/database/estimate-ai-run-sql.spec.ts
PASS src/plugins/sales/estimate/services/estimate-totals.spec.ts
PASS src/plugins/sales/estimate/services/estimate-read.port.spec.ts (8.519 s)
PASS src/plugins/sales/estimate/services/estimate-verify.service.spec.ts (8.529 s)
PASS src/plugins/sales/estimate/estimate.controller.spec.ts (38.558 s)
Test Suites: 15 passed, 15 total
Tests:       331 passed, 331 total
Snapshots:   0 total
Time:        39.57 s, estimated 81 s
Ran all test suites matching src/plugins/sales/estimate|src/kernel/core/config.

-- docker compose config, backend service (values hidden; the check counts keys set to an empty string):
      AI_PROVIDER: [value hidden]
      OPENAI_API_KEY: [value hidden]
      OPENAI_MODEL: [value hidden]
empty-string key overrides: 0
```

Review: PASS (code-auditor, one round; 0 Critical/High/Medium, 5 Low: fixed filename `document.pdf` for every document block (true today, only PDFs become document blocks), factory test imports the whole estimate module, unknown-provider test does not assert Anthropic, no startup warning for a mistyped AI_PROVIDER, max_output_tokens fixed at 32000).
Limitations: No call to OpenAI has been made; every unit test uses a fake fetch. Unconfirmed until the live walkthrough: that `gpt-5.6-luna` exists for this account and accepts PDF `input_file` and image data URLs, forced function calling, `strict:false`, and an output cap of 32000 (a lower cap would give HTTP 400, shown only as a 503 with status=400 in the log). Endpoint choice is the Responses API because its documentation gives JSON examples for both forced function calls and PDF base64. Unknown AI_PROVIDER fails closed (503). The earlier compose `ANTHROPIC_*` blanking entries were removed; keys now reach the container only through env_file, so `restart` does not re-read them and a container recreate is needed to pick up a changed key. Mutations proven by the implementer: logging the body, mapping 429 to an internal error, and a factory that ignores the provider each failed exactly one test. Extra file beyond the original Ownership: ai-provider.config.spec.ts (approved).
