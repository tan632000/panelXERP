# P1 — Nền tảng + chuỗi bán hàng (Yêu cầu → Dự toán → Báo giá → Đơn hàng)
Specs-Contract: process-first-ready-v1

`REF` = `C:/Users/HOME/Documents/Project/Vibe-Coding/vn0047-haiphuong-erp-develop` (repo tham chiếu, chỉ đọc).
Roadmap tổng: [docs/development-roadmap.md](../../docs/development-roadmap.md).

## Scope decision (GATE-SCOPE — 2026-10-22)
- Existing: kernel auth/roles/audit/files/notification `REF/backend/src/kernel/core/*`; plugin contract `REF/backend/src/kernel/platform/plugins/plugin.contract.ts:9`; plugin catalog `REF/backend/src/kernel/platform/plugins/enabled-plugins.ts:28`; document codes `REF/backend/src/kernel/shared/document-code/document-code.service.ts:26`; base entity `REF/backend/src/kernel/shared/entities/base.entity.ts:9`; quotation versioning + approval pattern `REF/backend/src/plugins/sales/quotation/enums/quotation-status.enum.ts:11`; seed roles `REF/backend/src/kernel/core/database/seeds/seed-roles.ts`.
- Not existing in REF: barcode (grep `barcode` in `REF/backend/src/plugins` → 0 files), BOM/estimate for panels, AR/AP, KPI.
- Kernel→plugin coupling to strip on copy: `enabled-plugins.ts:28`, `enabled-features.ts:29`, `seed-roles.function-list.spec.ts`, `seed-roles.packaging-dispatch.spec.ts`, 5 frontend kernel tests importing `@plugins/` (see task-01).
- Minimum change: bootstrap repo + 4 plugins (`crm`, `catalog`, `engineering`, `sales`) delivering the request→estimate→quotation→order chain.
- Expansion signals: 9 feature groups ≥ 6 independent subsystems → split into P1–P6 (roadmap).
- User decision: KEEP — roadmap + detailed P1 only; copy kernel into panelXERP; USB/Bluetooth keyboard-wedge scanner; e-invoice deferred (manual invoice number).

## Out of scope
- Stock check, purchase suggestion, barcode, warehouse (P2). Estimate shows reference purchase price only.
- Production, QC, delivery, accounting, KPI (P3–P6). E-invoice integration (after P6).
- Configurable approval engine, custom fields engine, multi-tenant, mobile app.

## Decisions
| ID | Chosen | Rejected | Why | Load-bearing assumption | Break signal → response |
|---|---|---|---|---|---|
| D-01 | Copy REF kernel + infra, empty plugin catalog | Add plugins inside REF; greenfield | User choice at GATE-SCOPE; REF domain plugins don't fit panel shop | Kernel compiles without any plugin | typecheck fails on `@plugins/` import → strip/replace caller, never copy a REF plugin |
| D-02 | 4 plugins: `crm`, `catalog`, `engineering`, `sales` | One `sales` plugin for everything | Mirrors department ownership (Sale vs Kỹ thuật) and REF rule "no cross-plugin imports" | `_shared/gateways` + domain events suffice for handoff | Need for direct import → add gateway port, not import |
| D-03 | Quotation reuses REF version model: each revision = new version, previous becomes `closed` | Mutable quotation + audit diff | Requirement "lưu lịch sử điều chỉnh"; proven in REF | — | — |
| D-04 | Order created only from a `customer_confirmed` quotation version, copying lines (snapshot) | Order references live quotation lines | Later quotation edits must not alter a signed order | — | — |
| D-05 | Estimate = list of panels (tủ), each with BOM lines + cost lines by category (material, design, labor, installation, transport) | Flat BOM per request | Requirement "danh sách vật tư cho từng tủ điện" | — | — |

## Coverage profile
| ID | Outcome | Change kinds | Material surfaces | Ambiguity/action | Risk/evidence | Required proof |
|---|---|---|---|---|---|---|
| CP-01 | Repo boots: login works, empty ERP shell, lint/typecheck/test/migration-validator pass | add, integrate | runtime/deploy, API, UI | none | critical (auth) — copied kernel | source + live |
| CP-02 | Panel-shop roles with department permissions | add | data, API | decision-needed (Q3 role list) | critical (privilege) | source |
| CP-03 | Customer / contact / project CRUD | add | data, API, UI | none | routine | source |
| CP-04 | Item catalog CRUD + Excel import | add | data, API, UI | none | routine | source |
| CP-05 | Sales request with attachments, due date, assigned engineer + notification | add | data, API, UI, async | none | elevated (files, notifications) | source |
| CP-06 | Estimate per panel (BOM + cost lines), submit back to Sale + notification | add | data, API, UI, async | none | elevated (money) | source |
| CP-07 | Quotation from estimate: margin, discount, VAT, versions, internal approval, customer feedback | add | data, API, UI, async | decision-needed (Q1 approval rule, Q2 pricing/rounding) | critical (money) | source |
| CP-08 | Order from confirmed quotation, inherited data, full chain traceable | add | data, API, UI | none | critical (money) | source + live |

## Acceptance criteria
| ID | EARS criterion | Proof |
|---|---|---|
| AC-01 | When the stack starts with no domain plugin data, the system shall serve `/health` 200 and accept login of the seeded admin. | task-01 |
| AC-02 | The system shall pass full backend/frontend lint, typecheck, test and the migration validator on the bootstrapped repo (run via `docker compose exec`; host has no `make`). | task-01 |
| AC-03 | When a user lacks a permission, the API shall return 403 for that feature's endpoints. | task-02 |
| AC-04 | When a customer, contact or project is created with a duplicate code, the API shall return 409. | task-03 |
| AC-05 | When an item Excel file is imported, the system shall create valid rows and report invalid rows with row number and reason. | task-04 |
| AC-06 | When a sales request is assigned to an engineer, the system shall create a notification for that engineer. | task-05 |
| AC-07 | When an estimate is submitted, the system shall lock it from edits and notify the request's sales owner. | task-06 |
| AC-08 | When a quotation is created from a submitted estimate, the system shall copy every panel and line cost and compute price per the Q2 rule. | task-07 |
| AC-09 | When a quotation version is revised, the system shall create version N+1 and set version N to `closed`. | task-07 |
| AC-10 | If a quotation version is not approved, the system shall refuse to mark it `customer_confirmed`. | task-07 |
| AC-11 | When an order is created from a `customer_confirmed` version, the system shall snapshot its lines and link request, estimate, quotation version. | task-08 |
| AC-12 | If an order already exists for a quotation, the system shall refuse a second conversion with 409. | task-08 |

## Tasks
| # | Task | Priority | Criteria | Primary ownership | Dependencies | Status |
|---|---|---|---|---|---|---|
| 01 | Bootstrap repo from REF kernel | P1 | AC-01, AC-02 | `backend/`, `frontend/`, `docker/`, root infra | - | pending |
| 02 | Panel-shop roles & permission seed | P1 | AC-03 | `backend/src/kernel/core/database/seeds/seed-roles.ts` | 01 | blocked |
| 03 | CRM plugin: customer, contact, project | P1 | AC-04 | `backend/src/plugins/crm/`, `frontend/src/plugins/crm/` | 02 | pending |
| 04 | Catalog plugin: item catalog + import | P1 | AC-05 | `backend/src/plugins/catalog/`, `frontend/src/plugins/catalog/` | 02 | pending |
| 05 | Sales request + engineer handoff | P1 | AC-06 | `backend/src/plugins/sales/request/`, `frontend/src/plugins/sales/request/` | 03 | pending |
| 06 | Engineering estimate (BOM + costing) | P1 | AC-07 | `backend/src/plugins/engineering/`, `frontend/src/plugins/engineering/` | 04, 05 | pending |
| 07 | Quotation: pricing, versions, approval | P1 | AC-08, AC-09, AC-10 | `backend/src/plugins/sales/quotation/`, `frontend/src/plugins/sales/quotation/` | 06 | blocked |
| 08 | Order from confirmed quotation + chain e2e | P1 | AC-11, AC-12 | `backend/src/plugins/sales/order/`, `frontend/src/plugins/sales/order/`, `backend/test/sales-chain.e2e-spec.ts` | 07 | pending |

## Open decisions (GATE-REVIEW)
- Q1 [NEEDS CLARIFICATION: quotation internal approval rule — fixed 1 step by Sale Manager, or 2 steps (Sale Manager → Director) above an amount / below a margin threshold?] → blocks task-07.
- Q2 [NEEDS CLARIFICATION: pricing — price = cost × (1 + margin%) per panel or per line? discount on line or total? VAT rate per line (0/5/8/10%)? VND rounding to integer at line or at total?] → blocks task-07.
- Q3 [NEEDS CLARIFICATION: role list — proposed Admin, Director, SalesManager, Sales, EngineeringLead, Engineer; Sales sees only own customers or all?] → blocks task-02.

## Review log
- Round 1: pending.
