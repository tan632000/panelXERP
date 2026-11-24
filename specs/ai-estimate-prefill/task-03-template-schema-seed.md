# Task 03 — Template báo giá: bảng, entity và 5 mẫu seed

Status: done

## Outcome
Có `quotation_templates` → `quotation_template_panels` → `quotation_template_lines` (liên kết `items`); `SEED_SCOPE=all` seed idempotent 5 template rút từ `docs/baogia`, đăng ký như seed của feature `template` (D-08, D-14).

## Scope
- In:
  - Migration `backend/src/plugins/sales/template/database/migrations/<Date.now()>-init-quotation-template.ts`: 3 bảng, FK tới `items`, unique `code` trên dòng chưa xoá, unique `(template_id, lower(tag))`; `down()` xoá 3 bảng.
  - 3 entity (template kế thừa `BaseEntity` như `crm/project`).
  - Template tự đăng ký chặn xoá item: `registerItemCheck('quotation_template', …)` trong `onModuleInit` của module template, import `CatalogGatewayModule` như `estimate.module.ts` (mẫu `estimate.service.ts:140-146`). Không sửa `catalog/item`.
  - Seed: file trong `backend/src/plugins/sales/template/database/` gắn qua `seed:` của feature `template` (`runFeatureSeeds`, `sales.plugin.ts:12-13`), chỉ chạy với `SEED_SCOPE=all`. Upsert vật tư theo `LOWER(code)` (không giá), rồi 5 template theo bảng nguồn dưới.
  - Nguồn: `docs/baogia/*.pdf`, **bỏ file có đuôi `(1)`**. Hai bản scan (`LSX-115`, `LSX-123`) render ảnh bằng `pdfplumber` (script mẫu ở bước 1) và chép tay. Chỉ dòng có Mã hàng; dòng không có thì bỏ, không tự đặt mã; nếu Mã hàng là kích thước vỏ tủ (LSX-123) thì dùng đúng chuỗi đó.
- Out: API/quyền (task-04); template từ file mới; dòng nguồn không có mã hàng.

### Bảng nguồn cố định
| Template (code) | Nguồn | Tủ (panel) | Mã hàng chính (hãng) |
|---|---|---|---|
| Tủ lò hơi 6.5T (`TPL_0001`) | LSX-125 | 1 | 1800x800x400 (vỏ); BW32AAG 3P 10A, BCL63E0CG-2P010/3P020/3P032, FRN0029E3S-4G, FRN0018C2S-4A, SC-4-1 (Fuji); DF2CA02, RXM2LB2P7, XA2AD33 (Schneider); 61F-GP-N, S8VK-C12024 (Omron); VAF36A (Selec); KTP900 Basic 6AV2123-2JB03-0AX0 (Siemens); 12038 HSL (Asia) |
| Tủ bật tắt vít tải 2.2kW (`TPL_0002`) | LSX-122 | 1 | 500x350x200 (vỏ); BCL63E0CG-3P010, SC-03, TR-0N(5–8) (Fuji); RT 18-32X, ML22-22, MLST, ML11D, ML11 (Morele) |
| Tủ ổ cắm (`TPL_0003`) | LSX-123 (scan) | 1 (quantity 3) | 700x500x250 (vỏ); ABN103c 3P 100A, LA63N 1P 16A, LA63N 3P 16A, LA63N 3P 32A (LS); RT 18-32X, ML22-22 (Morele) |
| Tủ ATS 200A (`TPL_0004`) | LSX-127 | 1 | B60020WN (Vitzro); BW253E0 3P 200A, BCL63E0CG-3P040, BW100EAG-3P (Fuji); RT 18-32X, ML22-22, ML20X (Morele) |
| Tủ phân phối đa tủ (`TPL_0005`) | LSX-115 (scan, 5 trang) | 8: TĐT tổng, TĐT1 nồi hơi, TĐT2 thanh trùng-bao bì, TĐT3 đóng gói, TĐT4 đồ chín, TĐT5 đồ sống, TĐT6 kho lạnh -18, TĐT7 container lạnh | BW800EAG-3P, BW253E0 3P 250A/200A, BW163E0 3P 150A, BW50EAG-3P040, BW32AAG 3P 20A, BW32AAG-3P30, BW63RAG-3P, BCL63E0CG-3P040/2P040/3P032/2P032/1P006, SC-N1, SC-N2, SC-5-1, SC-4-1 (Fuji); MFM383A, TS2M1-1-16A-230V (Selec); MSQ, ML96, ML, ML22-22, RT 18-32X (Morele) |

`group_label` lấy từ tiêu đề nhóm tải trong nguồn (ví dụ "Điều hòa", "Chiếu sáng", "Đèn UV (timer)", "Dự phòng", "Container lạnh 1,2,3"). Số dòng đúng theo nguồn; Receipt phải liệt kê số panel và số line của từng template.

### Ánh xạ nhóm/đơn vị vật tư
| Họ linh kiện | `group` | `unit` |
|---|---|---|
| Vỏ tủ | `enclosure` | Cái |
| MCCB, MCB, CB motor, ATS | `breaker` | Cái |
| Khởi động từ, contactor | `contactor` | Cái |
| Rơ le nhiệt, rơ le trung gian, timer, bộ báo mức | `relay` | Cái |
| Biến tần | `inverter` | Cái |
| HMI/PLC | `plc` | Cái |
| Đèn báo, nút nhấn, công tắc xoay, cầu chì, đồng hồ, biến dòng, nguồn, quạt | `accessory` | Cái (nút ON-OFF: Bộ) |

## Coverage
- CP-01

## Ownership
- Create: migration trên, `backend/src/plugins/sales/template/entities/quotation-template.entity.ts`, `.../quotation-template-panel.entity.ts`, `.../quotation-template-line.entity.ts`, `.../template.module.ts`, `.../database/seed-quotation-templates.ts`, `.../database/quotation-template.migration.spec.ts`
- Modify: `backend/src/plugins/sales/sales.features.ts` (đăng ký feature `template` với `seed`)
- Read: `docs/baogia/*.pdf`, `backend/src/plugins/catalog/item/enums/item-group.enum.ts`, `backend/src/kernel/core/database/seeds/seed-runner.ts:27-47`

## Steps
1. Render hai bản scan: `.claude/skills/.venv/Scripts/python.exe -I <script> "docs/baogia/LSX-115 - TỦ PHÂN PHỐI TH89 -CHỐT.pdf" <thư-mục-tạm>/p115_` (script `pdfplumber.to_image` trong scratchpad) rồi chép dòng có Mã hàng.
2. Migration spec trên schema tạm: tạo bảng; trùng `code` → lỗi; trùng `tag` khác hoa/thường → lỗi; xoá item đang trong template bị chặn; `down()` sạch.
3. Viết seed; chạy `SEED_SCOPE=all` hai lần liên tiếp → số bản ghi không đổi.
4. Spec seed: mỗi template đúng số panel ở bảng nguồn; mọi line trỏ `item_id` tồn tại; không line nào có giá; mọi vật tư có `group` thuộc enum.

## Acceptance
- AC-03 (phần dữ liệu): bảng/ràng buộc đúng; seed idempotent; xoá item trong template bị chặn.

## Dependencies
- none

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run validate:migrations && npm run migration:run && npm test -- --ci src/plugins/sales/template && SEED_SCOPE=all npm run seed && SEED_SCOPE=all npm run seed"`
- Named probe: `quotation-template.migration.spec.ts` (Steps 2, 4); hai lần seed liên tiếp thoát 0 (Step 3).
- Reachability: known; cần DB dev của compose đang chạy.
- Oracle: exit 0, 0 skipped; lần seed thứ hai không thêm bản ghi (spec đếm hàng); số panel đúng bảng nguồn.
- Counterexample: seed không idempotent làm Step 3 fail; thiếu unique `code` làm Step 2 fail; tự đặt mã cho dòng thiếu mã làm Step 4 fail (mã không có trong nguồn).
- Artifacts: dữ liệu template giữ lại trong DB dev (không cleanup).

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run validate:migrations && npm run migration:run && npm test -- --ci src/plugins/sales/template && SEED_SCOPE=all npm run seed && SEED_SCOPE=all npm run seed"
Exit: 0
Base: f73351cdfeafff02f1e6a585e2666bfb2f0e44be
Head: 351a7f1835c2f7adce55cdbc500c994c078adaffe0301ea881fedb9f1d6ba656
```text

> panelxerp-backend@0.0.1 lint
> eslint "{src,apps,libs,test}/**/*.ts" --max-warnings=0


> panelxerp-backend@0.0.1 typecheck
> tsc --noEmit -p tsconfig.build.json


> panelxerp-backend@0.0.1 validate:migrations
> ts-node -r tsconfig-paths/register scripts/validate-migration-filenames.ts

Migration filename check passed (56 files).

> panelxerp-backend@0.0.1 migration:run
> npm run typeorm -- migration:run -d src/kernel/core/database/data-source.ts


> panelxerp-backend@0.0.1 typeorm
> ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:run -d src/kernel/core/database/data-source.ts

No migrations are pending

> panelxerp-backend@0.0.1 test
> node scripts/run-tests.js --ci src/plugins/sales/template

PASS src/plugins/sales/template/database/quotation-template.migration.spec.ts
PASS src/plugins/sales/template/database/quotation-template-seed.spec.ts (5.014 s)

Test Suites: 2 passed, 2 total
Tests:       9 passed, 9 total
Snapshots:   0 total
Time:        5.688 s
Ran all test suites matching src/plugins/sales/template.

> panelxerp-backend@0.0.1 seed
> ts-node -r tsconfig-paths/register src/kernel/core/database/seeds/seed-runner.ts

[seed-runner] Scope: all (NODE_ENV=development)
[seed-runner] Running core seeds...
[seed:users] 0 users created, 14 already existed and were left untouched (domain: example.com)
[seed-runner] Core seeds done.
[seed-runner] Running plugin seeds...
[seed-runner] All seeds completed.

> panelxerp-backend@0.0.1 seed
> ts-node -r tsconfig-paths/register src/kernel/core/database/seeds/seed-runner.ts

[seed-runner] Scope: all (NODE_ENV=development)
[seed-runner] Running core seeds...
[seed:users] 0 users created, 14 already existed and were left untouched (domain: example.com)
[seed-runner] Core seeds done.
[seed-runner] Running plugin seeds...
[seed-runner] All seeds completed.

-- dev DB after the run (template|panels|lines):
TPL_0001|1|21
TPL_0002|1|9
TPL_0003|1|7
TPL_0004|1|7
TPL_0005|8|127
```

Review: PASS (code-auditor, round 2; round 1 PASS_WITH_WARNINGS, Medium fixed by spec asserting the exact part-number set per template).
Limitations: TPL_0001 and TPL_0002 carry an enclosure line whose Mã hàng is the size string (1800x800x400, 500x350x200), confirmed in the PDF text; TPL_0004 has none because the LSX-127 cell is empty. The two scanned sheets were checked by the reviewer against rendered pages by eye, not by OCR. The spec locks part numbers, not per-line quantity or group_label. No test proves `onModuleInit` registers the item check (the hard FK still blocks physical delete).
