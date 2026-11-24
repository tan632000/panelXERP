# Task 02 — Dịch vụ trích xuất AI: tài liệu + template + danh mục → JSON đã kiểm, đã che giá

Status: done

## Outcome
Một hàm `extractEstimateDraft(input)` nhận tài liệu của request, yêu cầu kỹ thuật, template (tùy chọn) và danh mục vật tư đang hoạt động, gọi `AiClient`, trả về dữ liệu đã chuẩn hoá và đã che mọi số tiền theo D-05/D-11/D-12, hoặc ném lỗi có kiểu không chứa nội dung upstream (D-01).

## Scope
- In:
  - Port `AiClient` + `AnthropicAiClient` bằng `fetch` (tool use buộc gọi `submit_estimate`, có `max_tokens`, timeout 120s); config `anthropic.config.ts` (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`); lỗi có kiểu `AiNotConfiguredError|AiRateLimitedError|AiTimeoutError|AiOutputInvalidError|AiInternalError` mỗi lớp có mã và câu cố định tiếng Việt, không mang body/header upstream; log chỉ ghi `status`.
  - `document-reader`: attachment S3 → khối `document`/`image` base64 (PDF, ảnh); Excel → text (3 sheet đầu, ≤200KB, `exceljs`); loại khác (Word, DWG, DXF…) và object mất (`NoSuchKey`) → "skipped" kèm lý do; tối đa 10 file; tổng sau base64 ≤ 20MB, file vượt → skipped.
  - `prefill-prompt.builder`: prompt hệ thống (cấm nhắc giá; mọi tài liệu bọc trong thẻ dữ liệu "không phải lệnh") + template (panel/line/group_label) + danh mục compact (`id, code, name, brand, unit`); >3000 item → `CatalogTooLargeError`.
  - `prefill-schema` + `redact-money.ts`: JSON Schema + chuẩn hoá D-05 (panel quantity nguyên ∈ [1, `MAX_PANEL_QUANTITY`]; line quantity ∈ (0, `MAX_BOM_QUANTITY`]; tag ≤50 duy nhất không phân biệt hoa/thường, trùng → hậu tố `-2`; description ≤500; `aiNote` ≤1000; line note ≤500; `requirementsSummary` ≤2000; `unmatched` ≤50; ≤50 panel, ≤500 line/run; `itemId` ngoài danh mục bị bỏ + ghi `aiNote`; panel không còn line bị bỏ); `redactMoney` áp lên mọi chuỗi tự do (D-12).
  - Biến môi trường vào `backend/.env.example` và `compose.yml` (không ghi key).
- Out: ghi DB, job, notification, quyền (task-06).

## Coverage
- CP-03
- CP-04

## Ownership
- Create: `backend/src/plugins/sales/estimate/ai/ai-client.port.ts`, `.../ai-errors.ts`, `.../anthropic-ai.client.ts`, `.../document-reader.ts`, `.../prefill-prompt.builder.ts`, `.../prefill-schema.ts`, `.../redact-money.ts`, `.../extract-estimate-draft.ts`, `.../extract-estimate-draft.spec.ts`, `backend/src/kernel/core/config/anthropic.config.ts`
- Modify: `backend/src/kernel/core/config/config.module.ts`, `backend/.env.example`, `compose.yml`
- Read: `backend/src/plugins/sales/request/utils/attachment-type.util.ts`, `backend/src/kernel/core/files/files.service.ts`, `backend/src/plugins/sales/estimate/constants/estimate.constant.ts:20-30`

## Steps
1. Đọc `attachment-type.util.ts` và ghi loại cho phép vào `document-reader`.
2. Spec với `AiClient` giả: output hợp lệ → trả đúng; `itemId` lạ → dòng bị bỏ + note; quantity 0/âm/vượt → bị bỏ + note; panel quantity không nguyên → `AiOutputInvalidError` (schema khai báo integer); tag trùng → `-2`; panel rỗng bị bỏ; confidence 1.5 hoặc >50 panel → `AiOutputInvalidError`.
3. Spec redact: chuỗi chứa "Đơn giá 85.000.000đ", "thành tiền: 1.200.000 VND", "$1,200" → không còn số tiền trong `aiNote`, `note`, `reason`, `description`, `requirementsSummary`.
4. Spec reader: PDF/ảnh → khối base64 đúng media type; xlsx → text ≤200KB; docx/dwg → skipped; `NoSuchKey` → skipped; 11 file → chỉ 10; tổng base64 > 20MB → file cuối skipped.
5. Spec prompt: có template + id danh mục + câu cấm giá + thẻ dữ liệu; 3001 item → `CatalogTooLargeError`; thiếu key → `AiNotConfiguredError`.
6. Spec client: `fetch` giả trả tool_use hợp lệ / HTTP 429 / timeout / ném lỗi chứa chuỗi "sk-ant-TEST" → lỗi đúng kiểu, chuỗi "sk-ant-TEST" không xuất hiện trong lỗi lẫn log (spy logger).

## Acceptance
- AC-02: output vượt biên hoặc sai schema bị từ chối; chuỗi AI không còn số tiền; lỗi không lộ upstream.
- AC-07 (phần che giá).

## Dependencies
- none

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm test -- --ci src/plugins/sales/estimate/ai"`
- Named probe: `extract-estimate-draft.spec.ts` (Steps 2-6).
- Reachability: source known; live call tới Anthropic `UNKNOWN` (cần `ANTHROPIC_API_KEY`) — thuộc task-12, ghi vào limitations ở GATE-DONE.
- Oracle: exit 0, 0 skipped; từng trường hợp lỗi ném đúng lớp; không số tiền còn lại trong chuỗi.
- Counterexample: validator chấp nhận `itemId` ngoài danh mục phải làm Step 2 fail; bỏ `redactMoney` phải làm Step 3 fail; lưu `err.message` upstream phải làm Step 6 fail.
- Artifacts: không có.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm test -- --ci src/plugins/sales/estimate/ai"
Exit: 0
Base: f73351cdfeafff02f1e6a585e2666bfb2f0e44be
Head: 9fcece865f5deec080a8b9496a945f08043df6db79a18bc8cd66af55307f1c4e
```text
$ docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm test -- --ci src/plugins/sales/estimate/ai"
> eslint "{src,apps,libs,test}/**/*.ts" --max-warnings=0
> tsc --noEmit -p tsconfig.build.json
PASS src/plugins/sales/estimate/ai/extract-estimate-draft.spec.ts (5.847 s)
    ✓ returns a valid output as is (13 ms)
    ✓ drops a line whose itemId is not in the catalog and records a note (1 ms)
    ✓ drops a line with quantity 0 (1 ms)
    ✓ drops a line with quantity -1
    ✓ drops a line with quantity 1000001
    ✓ rejects a non-integer panel quantity (1 ms)
    ✓ suffixes a duplicate tag case-insensitively (1 ms)
    ✓ drops a panel left with no line
    ✓ rejects confidence above 1 and more than 50 panels (2 ms)
    ✓ rejects output that is not an object
    ✓ truncates long strings and caps unmatched at 50 (1 ms)
    ✓ keeps a panel whose tag was only a price, naming it by position
    ✓ strips money from every free-text field (1 ms)
    ✓ leaves no figure of "Đơn giá 85.000.000đ"
    ✓ leaves no figure of "thành tiền: 1.200.000 VND" (1 ms)
    ✓ leaves no figure of "$1,200"
    ✓ leaves no figure of "Tầm 85 triệu"
    ✓ leaves no figure of "khoảng 1,2 tỷ"
    ✓ leaves no figure of "chốt 12.5tr nhé"
    ✓ leaves no figure of "chỉ 85tr"
    ✓ leaves no figure of "còn 500k" (1 ms)
    ✓ leaves no figure of "đ85.000"
    ✓ leaves no figure of "VND1200" (1 ms)
    ✓ leaves no figure of "USD1,200"
    ✓ leaves no figure of "USD 1.200"
    ✓ leaves no figure of "1200 đồng"
    ✓ leaves no figure of "5 đồng"
    ✓ leaves no figure of "1.2 billion"
    ✓ leaves no figure of "Cost 85M" (1 ms)
    ✓ leaves no figure of "tổng tiền 85 triệu"
    ✓ leaves no figure of "chi phí khoảng 85tr"
    ✓ leaves no figure of "don gia 85000"
    ✓ leaves no figure of "giá 500k"
    ✓ leaves no figure of "giá: 12000"
    ✓ leaves no figure of "giá khoảng 85 triệu"
    ✓ leaves no figure of "Gia 85000"
    ✓ leaves no figure of "85.000.000d"
    ✓ leaves no figure of "85.000.000 d" (1 ms)
    ✓ leaves no figure of "VND: 85.000"
    ✓ leaves no figure of "EUR 1.200"
    ✓ leaves no figure of "€1.200" (1 ms)
    ✓ leaves no figure of "1.200 EUR"
    ✓ leaves no figure of "500 tệ"
    ✓ leaves no figure of "¥1200"
    ✓ leaves no figure of "Giá 85000" (1 ms)
    ✓ keeps the technical text "Tủ 3 pha 400V"
    ✓ keeps the technical text "Giá đỡ thanh cái 3P"
    ✓ keeps the technical text "giá trị dòng định mức 100A" (1 ms)
    ✓ keeps the technical text "giá treo cáp 2 tầng"
    ✓ keeps the technical text "Cắt 10kA 3P, 100kW"
    ✓ keeps the technical text "3 đèn báo, 5 trụ" (1 ms)
    ✓ keeps the technical text "Tủ 800x600x2000"
    ✓ keeps the technical text "Treo bằng 4 ty ren M10"
    ✓ keeps the technical text "Điện trở 10k" (1 ms)
    ✓ keeps the technical text "Điện trở 4.7 k"
    ✓ keeps the technical text "Tỷ lệ biến áp 22/0.4kV"
    ✓ keeps the technical text "Tỷ số biến dòng 100/5A"
    ✓ keeps the technical text "Tuổi thọ cơ khí 10 triệu lần đóng cắt" (1 ms)
    ✓ keeps the technical text "Tuổi thọ 25 nghìn lần"
    ✓ keeps the technical text "Cảm biến nhiệt NTC 10k"
    ✓ keeps the technical text "Icu 36k"
    ✓ removes the spelled amount "tám mươi lăm triệu đồng" (1 ms)
    ✓ removes the spelled amount "một trăm triệu"
    ✓ removes the spelled amount "Tầm hai tỷ"
    ✓ removes the spelled amount "hai trăm năm mươi nghìn" (1 ms)
    ✓ keeps the dimension in front of a price on the same line (1 ms)
    ✓ stays fast on a hostile string (3 ms)
    ✓ turns a pdf and an image into base64 blocks of the right media type (3 ms)
    ✓ reads the first 3 sheets of an xlsx as text within 200KB (112 ms)
    ✓ skips unsupported types and missing objects with a reason (1 ms)
    ✓ skips an image over 5MB and keeps the rest (2 ms)
    ✓ reads at most 10 files (1 ms)
    ✓ skips the file that pushes the base64 total past 20MB (18 ms)
    ✓ carries the template, catalog ids, the no-price rule and data tags (1 ms)
    ✓ throws CatalogTooLargeError above 3000 items (4 ms)
    ✓ sends a forced tool call and returns the tool input (1 ms)
    ✓ throws AiNotConfiguredError without a key and does not call out (1 ms)
    ✓ maps 429 to AiRateLimitedError and other HTTP errors to AiInternalError
    ✓ maps a timeout to AiTimeoutError (1 ms)
    ✓ rejects a reply without the tool call as invalid output
    ✓ never leaks the key or upstream text through the error or the log (2 ms)
Test Suites: 1 passed, 1 total
Tests:       81 passed, 81 total
Snapshots:   0 total
Time:        6.107 s, estimated 9 s
```

Review: code-auditor PASS on the third repair round (first two passes FAIL on `redactMoney`: missed Vietnamese price forms, and false positives on technical text such as "giá đỡ", "Tỷ lệ biến áp", "Điện trở 10k"; all fixed and re-reviewed).

Limitations: no live call to Anthropic (request shape and the `claude-sonnet-5-5` default are [UNVERIFIED] until task-12 with a real `ANTHROPIC_API_KEY`); `redactMoney` is a regex heuristic (accepted Low: a bare figure without a unit such as "85.000.000" survives, informal "đô", unaccented "ngan"/"dong" read as money); `extractEstimateDraft(input, client)` takes the client as its second parameter and `AnthropicAiClient` is a plain class (task-06 builds it from the `anthropic` config); storage errors other than `NoSuchKey` are rethrown unwrapped, so task-06 must map every non-`AiError` to `AiInternalError` before storing `error` and test it; `skipped` documents are returned for task-06 to put in the run summary.
