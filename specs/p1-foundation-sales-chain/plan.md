# P1 — Nền tảng + chuỗi bán hàng (Yêu cầu → Dự toán → Báo giá → Đơn hàng)
Specs-Contract: process-first-ready-v1

`REF` = `C:/Users/HOME/Documents/Project/Vibe-Coding/vn0047-haiphuong-erp-develop` (read-only; never read its nested `vn0047-haiphuong-erp-develop/` copy).
Roadmap: [docs/development-roadmap.md](../../docs/development-roadmap.md). Host: Windows, Docker 27.5 + Compose v2.32, Node 20.17, **no `make`** → every command uses `docker compose exec -T`.

## Scope decision (GATE-SCOPE — 2026-10-22)
- Existing: kernel `REF/backend/src/kernel/core/*`; plugin contract `REF/backend/src/kernel/platform/plugins/plugin.contract.ts:9`; catalog `enabled-plugins.ts:28`; document codes `REF/backend/src/kernel/shared/document-code/document-code.service.ts:26`; retry helper `REF/backend/src/kernel/shared/utils/db-error.util.ts:78` (`saveWithGeneratedCode`); `BaseEntity` `REF/backend/src/kernel/shared/entities/base.entity.ts:9`; quotation version pattern `REF/backend/src/plugins/sales/quotation/enums/quotation-status.enum.ts:11`; user/role admin UI `REF/frontend/src/plugins/system/`.
- Not in REF: barcode, panel BOM/estimate, AR/AP, KPI, object-level authorization, upload allowlist (`REF/backend/src/kernel/core/files/files.controller.ts` has no file filter).
- Minimum change: bootstrap + 3 plugins (`crm`, `catalog`, `sales`) delivering request → estimate → quotation → order.
- Expansion signals: 9 groups ≥ 6 subsystems → P1–P6 roadmap.
- User decision: KEEP — roadmap + detailed P1; copy REF kernel into panelXERP; USB/Bluetooth keyboard-wedge scanner; e-invoice deferred. "Hồ sơ báo giá ban đầu" = the sales request (task-07); no separate draft quote.

## Out of scope
- Stock check, purchase suggestion, barcode, warehouse (P2); production, QC, delivery, accounting, KPI (P3–P6); e-invoice.
- Quotation diff view, list Excel exports, BOM Excel import, KPI timing fields (cut by R-15). Item catalog Excel import stays; the customer-facing quotation .xlsx export in the `docs/BG.xlsx` layout is IN (user decision 2026-10-24).
- Configurable approval engine, custom fields, multi-tenant, mobile app, CI pipeline.

## Decisions
| ID | Chosen | Rejected | Why | Load-bearing assumption | Break signal → response |
|---|---|---|---|---|---|
| D-01 | Copy REF kernel + infra via explicit allowlist (task-01/02); keep `frontend/src/plugins/system` | Add plugins inside REF; greenfield | GATE-SCOPE choice | Kernel boots after the listed strips | any `@/?plugins/` hit outside `plugins/` → strip that caller, never copy a REF business plugin |
| D-02 | 3 plugins: `crm`, `catalog`, `sales` (request, estimate, quotation, order as features) | Separate `engineering` plugin | R-11: avoids sales↔engineering dependency cycle; same top-level plugin may import itself | Engineering ownership enforced by permissions, not plugin | — |
| D-03 | Quotation versions: statuses `draft|pending_approval|approved|rejected|customer_confirmed|cancelled|closed`; a version is editable only in `draft`; `submit` moves `draft → pending_approval` and the version becomes immutable; a rejected version stays `rejected` and Sales revises to N+1 (new `draft`); revise allowed from `pending_approval|approved|rejected`, creates N+1, N → `closed`; unique `(quotation_id, ver)` | Mutable quotation + audit diff | History requirement; REF pattern | — | — |
| D-04 | Order snapshots lines + customer name/tax code/address; orders are never deleted, only `cancelled`; unique `quotation_id` without soft-delete filter | Live references | R-04, R-13 | — | — |
| D-05 | Estimate = panels × (BOM lines + cost lines `design/labor/installation/transport/other`) | Flat BOM | "vật tư cho từng tủ" | — | — |
| D-06 | Money via `decimal.js`; amounts `numeric(18,2)` stored as integer VND after rounding; quantity `numeric(18,3)`; half-up | JS `number` | R-07: `Math.round(1.005*100)=100` | — | — |
| D-07 | Request/estimate/quotation status changes run synchronously inside the same transaction; only notifications are after-commit; transitions forward-only and idempotent | Status via after-commit events | R-05: REF EventEmitter2 is in-process, no outbox | — | — |
| D-08 | Every state change on quotation/order locks the header row (`FOR UPDATE`) and updates `WHERE status = :expected` | Optimistic last-write | R-04 | — | — |
| D-09 | Document codes: unique index on code (no soft-delete filter); create wrapped in `saveWithGeneratedCode` retrying the whole transaction; year in `Asia/Ho_Chi_Minh` | REF preview MAX+1 alone | R-06 | — | — |
| D-10 | Pricing (Q2): panel unit price = round(panel unit cost × (1 + margin%)); line = unit price × panel qty; discount (% or amount) on subtotal; one VAT rate (0/5/8/10%) per quotation; round half-up to integer VND at panel unit price, discount, VAT | Per-item margin | GATE-REVIEW Q2 | — | — |
| D-11 | Approval (Q1): one step by SalesManager or Director; approver ≠ version creator | Multi-step | GATE-REVIEW Q1 | — | — |
| D-12 | Data scope (Q3): Sales sees only customers/requests/quotations/orders where `salesOwnerId = me` (others → 404); SalesManager, Director, EngineeringLead, Admin see all; Engineer sees requests assigned to them; Purchasing maintains catalog | Sales sees all | GATE-REVIEW Q3 | — | — |

## Coverage profile
| ID | Outcome | Change kinds | Material surfaces | Ambiguity/action | Risk/evidence | Required proof |
|---|---|---|---|---|---|---|
| CP-01 | Backend boots: migrate, seed, health, admin login; secrets hardened | add, integrate | runtime/deploy, API, security | none | critical (auth, secrets) | source + live |
| CP-02 | Frontend shell: login, user/role admin, empty navigation | add, integrate | UI, runtime | none | elevated | source + live |
| CP-03 | Roles, `module:action` permissions, data-scope helper | add | data, API, security | none | critical (privilege) | source |
| CP-04 | Customer + contact management with owner scope | add | data, API, UI | none | elevated | source |
| CP-05 | Project management | add | data, API, UI | none | routine | source |
| CP-06 | Item catalog + Excel import | add | data, API, UI | none | routine | source |
| CP-07 | Sales request, safe attachments, engineer assignment + notification | add | data, API, UI, files, async | none | critical (file IDOR) | source |
| CP-08 | Estimate per panel; only assigned engineer/Lead edits; submit back to Sales | add | data, API, UI, async | none | elevated (money) | source |
| CP-09 | Quotation pricing + versions | add | data, API, UI | none | critical (money) | source |
| CP-10 | Quotation approval, customer feedback, PDF | add | data, API, UI, async | none | critical (SoD) | source |
| CP-11 | Order from confirmed quotation; chain proven e2e | add | data, API, UI | none | critical (money) | source + live |

## Acceptance criteria
| ID | EARS criterion | Proof |
|---|---|---|
| AC-01 | When the backend stack is migrated and seeded on an empty DB, the system shall return 200 on `/api/v1/health` and issue a token on `POST /api/v1/auth/login` for the seeded admin. | task-01 |
| AC-02 | If `NODE_ENV=production` and any secret resolved by `resolveSecret` (e.g. `JWT_SECRET`) is `CHANGE_ME*` or shorter than 32 chars, the backend shall refuse to start; production seeding shall take the admin password from `SEED_ADMIN_PASSWORD` and never log it. | task-01 |
| AC-03 | The frontend shall pass lint (incl. i18n), typecheck, tests, and render login + user/role admin pages. | task-02 |
| AC-04 | When an actor lacks a `module:action` permission, the API shall return 403; when a Sales actor requests another owner's record, the API shall return 404. | task-03, task-04 |
| AC-05 | When a customer, project or item is created with a duplicate active code, the API shall return 409 (contacts carry no code; their rule is one primary contact per customer, also 409). | task-04, task-05, task-06 |
| AC-06 | If a customer, project or item is referenced by a sales document, the system shall refuse deletion with 409. | task-04, task-05, task-06 |
| AC-07 | When an item Excel file is imported, the system shall create all valid rows in one transaction and report invalid rows with row number and reason. | task-06 |
| AC-08 | When a request is assigned, the system shall notify the engineer once; attachments outside the allowlist or failing magic-byte check shall be rejected; downloads shall require access to the request. | task-07 |
| AC-09 | If an actor other than the assigned engineer or EngineeringLead edits or submits an estimate, the API shall return 404 (outside D-12 scope; 403 only when the permission itself is missing); when submitted, the request shall become `estimated` in the same transaction and the sales owner shall be notified. | task-08 |
| AC-10 | When a quotation is created from the latest submitted estimate, the system shall reproduce the D-10 worked example exactly. | task-09 |
| AC-11 | When two revise calls, or a revise and a confirm, race on one quotation, exactly one shall succeed and version numbers shall stay unique; revise is allowed only from `pending_approval`, `approved` or `rejected`. | task-09, task-10 |
| AC-12 | If the approver is the version creator, or the version is not `approved` when confirming, the API shall return 403 / 409 respectively. | task-10 |
| AC-13 | When an order is created from a `customer_confirmed` version, the system shall snapshot lines and customer data and link request, estimate, version; a second conversion shall return 409. | task-11 |
| AC-14 | Two documents created concurrently shall receive distinct codes. | task-07 |

## Tasks
Strictly sequential (one writer per shared registration file, R-08).

| # | Task | Priority | Criteria | Primary ownership | Dependencies | Status |
|---|---|---|---|---|---|---|
| 01 | Backend boot from REF kernel | P1 | AC-01, AC-02 | `backend/`, `docker/`, `compose*.yml`, root infra | - | done |
| 02 | Frontend shell from REF kernel | P1 | AC-03 | `frontend/` | 01 | done |
| 03 | Roles, permissions, data scope | P1 | AC-04 | `backend/src/kernel/core/database/seeds/`, `backend/src/kernel/shared/` scope helper | 02 | done |
| 04 | Customer + contact | P1 | AC-04, AC-05, AC-06 | `*/src/plugins/crm/customer`, `contact` | 03 | done |
| 05 | Project | P1 | AC-05, AC-06 | `*/src/plugins/crm/project` | 04 | done |
| 06 | Item catalog + import | P1 | AC-05, AC-06, AC-07 | `*/src/plugins/catalog/` | 05 | done |
| 07 | Sales request + attachments + assignment | P1 | AC-08, AC-14 | `*/src/plugins/sales/request` | 06 | done |
| 08 | Estimate (BOM + costing) | P1 | AC-09 | `*/src/plugins/sales/estimate` | 07 | done |
| 09 | Quotation pricing + versions | P1 | AC-10, AC-11 (revise race) | `*/src/plugins/sales/quotation` | 08 | done |
| 10 | Quotation approval + feedback + PDF | P1 | AC-11 (revise–confirm race), AC-12 | `*/src/plugins/sales/quotation` (approval, feedback, pdf) | 09 | pending |
| 11 | Order + chain e2e | P1 | AC-13 | `*/src/plugins/sales/order`, `backend/test/sales-chain.e2e-spec.ts` | 10 | pending |

Shared registration files every feature task appends to (owned by the running task only): `backend/src/kernel/platform/plugins/enabled-plugins.ts`, `backend/src/kernel/platform/features/enabled-features.ts`, `frontend/src/kernel/platform/plugins/enabled-plugins.ts`, `frontend/src/kernel/platform/features/enabled-feature-keys.ts`, `backend/src/kernel/core/users/list-preference.constant.ts`, `frontend/src/kernel/langs/load-messages.ts`, `frontend/src/kernel/langs/{vi,en}/*.json`, `frontend/src/kernel/core/api/generated/api.ts` (regenerated via `npm run generate:api`), `backend/src/kernel/core/database/seeds/seed-roles.ts`. Every feature task ends by regenerating `backend/docs/api/openapi.json` (`npm run generate:api-docs`) and `api.ts` (`npm run generate:api`) before its Verification Command.

## Review log
- Round 1 (2026-10-22): 3 fresh reviewers (Fact Checker; Security + Failure-mode; Assumption + Scope). 15 deduplicated findings R-01…R-15, all **accepted** by user. Q1 = 1-step SalesManager/Director, approver ≠ creator; Q2 = margin per panel, discount on total, one VAT, VND half-up at panel price/discount/VAT; Q3 = Sales own-records only, roles incl. Purchasing. Repairs: R-01→task-01/02 split + allowlist; R-02→AC-02; R-03→D-11/D-12, AC-04/09/12; R-04→D-04/D-08, AC-11; R-05→D-07; R-06→D-09, AC-14; R-07→D-06; R-08→sequential + shared-file list; R-09→lint+vitest in every Command; R-10→decisions closed so tasks pending; R-11→D-02; R-12→AC-08; R-13→AC-06, D-04; R-14→task-01 Steps/Command; R-15→task splits + cuts.
- Closure pass 1 (fresh reviewer): 11 PASS (R-01, 02, 03, 05, 07, 08, 09, 10, 11, 13, 15); 4 FAIL (R-04 revise–confirm race unowned, R-06 timezone unproven, R-12 kernel `/files` routes still open, R-14 login command expanded on host) + 5 contradictions (403 vs 404, login quoting, AC-11 owner, missing `rejected` status, `seed-users.spec.ts` delete-vs-rewrite). Repairs: D-03 adds `rejected` + revise-from set; AC-09 → 404; AC-11 → task-09 + task-10 with race spec; task-03 restricts `file:*` to admin; task-07 adds kernel-files 403, timezone and reference-check specs; task-01 Command uses outer single quotes (replayed locally: inner shell expands, host does not), `seed-users.spec.ts` rewritten, AC-02 narrowed to `resolveSecret`; plan adds per-task API regeneration.
- Sweep 1: files reread 12 / deltas 11 / stale references fixed 5 / conflicts left 0.
- Closure pass 2 (fresh reviewer): R-04, R-06, R-12, R-14 and the 4 earlier contradictions → PASS (R-14 replayed independently in bash; compose `env_file` confirmed). 3 new contradictions repaired: `file:upload` → `file:write` (task-03); shared `createWithDocumentCode` helper in task-07 reused by tasks 08/09/11 (D-09 for all codes); D-03 adds `draft` + `submit` transition (task-09/10). Paper-review budget (2 rounds) exhausted: further findings require runtime evidence.
- Limitation: Commands are written for Git Bash; quoting from PowerShell 5.1 is unverified.
- Scope update (2026-10-24, user decision after supplying `docs/BG.xlsx`, the company quotation): item import reads the BG layout (task-06 Import rules); every catalog item needs a code; quotation number `NN-ddmmyyyy/BG` per day (task-09, extends D-09); quotation output in .xlsx + PDF following the BG layout with editable default terms (task-10).
