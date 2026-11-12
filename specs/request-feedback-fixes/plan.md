# Sales feedback: request form, labels, detail close, estimate status
Specs-Contract: process-first-ready-v1

## Scope decision (GATE-SCOPE — 2026-11-11)
- Request (vi): (1)(6) "Thắng thầu" nghĩa là gì, bỏ đi?; (2) Công trình → Dự án; (3) chọn Khách hàng / Công trình hai chiều khi tạo yêu cầu báo giá; (4) nút X ở trang chi tiết về danh sách; (5) Sale đính kèm tài liệu hoặc mô tả kỹ thuật để kỹ thuật căn cứ; (7) bảng dự toán chỉ hiện trạng thái cuối cùng.
- Existing:
  - `won` is set when a customer-confirmed quotation becomes an order (`backend/src/plugins/sales/order/services/order-convert.service.ts:163`) and leaves only by order cancel (`backend/src/plugins/sales/request/constants/request-status-transitions.constant.ts:24`); vi label "Thắng thầu" at `frontend/src/kernel/langs/vi/request.json:80`, `"won": "Won"` at `frontend/src/kernel/langs/vi/status.json:30`. CRM projects carry no status (`backend/src/plugins/crm/project/entities/project.entity.ts`, no `status` column).
  - "Công trình" lives in 5 vi bundles (`crm.json:5`, `order.json:10`, `permission.json:91`, `project.json:2-49`, `request.json:9-161`) and `docs/user-flow-guide.md:26,83,89,91,97,105,157,317`.
  - Project select disabled until a customer is chosen (`frontend/src/plugins/sales/request/components/RequestFormFields.tsx:113`); `/projects` already returns `customerId/customerCode/customerName` within the actor's scope (`backend/src/plugins/crm/project/services/project.service.ts:48-51,83-94`).
  - All 15 detail screens share `frontend/src/kernel/core/components/ui/DetailPageLayout.tsx`; breadcrumbs carry `href` (`Breadcrumb.tsx:9-13`).
  - Technical requirements textarea already in the create form (`RequestFormFields.tsx:163-169`); attachments only on the detail page after creation (`RequestDetailContent.tsx:158`); `assign` has no content check (`backend/src/plugins/sales/request/services/request.service.ts:441-485`).
  - Two badges side by side: revision status + pricing (`EstimateDetailPage.tsx:211-219`, `RequestEstimateSection.tsx:80-95`); list rows carry `latestPricedAt` (`frontend/src/plugins/sales/estimate/types.ts:27`).
- Minimum change: label edits, one shared close button, frontend two-way picker, one backend assign guard plus create-time file queue, one derived estimate badge.
- Expansion signals: about 20 touched files, no new service, no migration; one packet.
- User decision: KEEP, with:
  1. Keep `won`; rename the vi label to "Đã lên đơn hàng" (D-01).
  2. Rename every vi "Công trình/công trình" to "Dự án/dự án", site address included (D-02).
  3. Technical requirements or ≥1 attachment is required when the request is assigned to an engineer, enforced in the backend; drafts save freely (D-03).

## Out of scope
- Removing `won` or any request status migration.
- English bundles (they already say "Project"/"Won").
- Drag-drop, preview, or editing attachments in the edit modal.
- Blocking a sale from clearing requirements/deleting files after assignment.
- Changing the estimate list status filter or revision tab labels: they keep "Đã gửi" (R-07).
- An X on input screens, or unsaved-change prompts (R-02).

## Decisions
| ID | Chosen | Rejected | Why | Load-bearing assumption | Break signal → response |
|---|---|---|---|---|---|
| D-01 | Relabel `won` "Đã lên đơn hàng" | Drop the status | Order cancel depends on `won → lost` (`quotation-approval.service.ts:289`, `request.service.ts:523`) | No other code keys off the vi label | A test asserts "Thắng thầu" → update that assertion |
| D-02 | Rename vi labels only | Rename code identifiers | Pure wording request | "Dự án R&D" stays distinct by its suffix | User reports confusion with R&D → ask at GATE-DONE |
| D-03 | Guard in `assign`, after the same-engineer no-op | Guard at create | User choice; a no-op stays 200 (R-09) | Files counted from `SalesRequestAttachment` rows (hard-deleted) | Assign refused with files present → check the count query |
| D-04 | Upload queued files after create, one by one | New multipart create endpoint | Reuses the existing upload API | Partial upload failure is visible | A file fails → toast names it, request stays created, detail page opens |
| D-05 | One badge: Nháp / Chờ điền giá / Đã điền giá / Đã thay thế | Two badges | User item 7 | `pricedAt` null ⇔ awaiting, latest revision only (R-06) | An older submitted revision shows a pricing label → pass no `pricedAt` there |
| D-06 | X derived from the last linked breadcrumb; `hideClose` on six input screens | X on every screen | View pages get it for free; input screens would lose typed data (R-02) | The last linked crumb is the list or the parent record (R-03) | A page without a linked crumb → no X shown |

## Coverage profile
| ID | Outcome | Change kinds | Material surfaces | Ambiguity/action | Risk/evidence | Required proof |
|---|---|---|---|---|---|---|
| CP-01 | vi UI says "Dự án" and "Đã lên đơn hàng" | modify | vi i18n bundles, user-flow guide | none | routine | source: i18n lint + grep |
| CP-02 | View pages show an X back to the list or parent record; input screens do not | add | `DetailPageLayout` | none | routine | source: vitest |
| CP-03 | Estimate status shows one final badge | modify | estimate badge, table, detail, request section | none | routine | source: vitest |
| CP-04 | Customer or project may be picked first | modify | request create form, `/projects` search | none | routine | source: vitest |
| CP-05 | Assign refused without requirements or files | add | request assign API, toast | none | elevated (API contract) | source: jest + vitest |
| CP-06 | Files can be attached in the create form | add | request create modal | none | routine | source: vitest |

## Acceptance criteria
| ID | EARS criterion | Proof |
|---|---|---|
| AC-01 | The vi UI shall show no "Công trình/công trình" and shall label `won` "Đã lên đơn hàng". | task-01 command |
| AC-02 | When a view page's breadcrumbs (excluding the current page) contain a linked crumb and `hideClose` is not set, the layout shall render a close (X) link to the last linked crumb's `href`. | task-02 command |
| AC-03 | The estimate status shall render exactly one badge: draft → Nháp, latest submitted unpriced → Chờ điền giá, latest submitted priced → Đã điền giá, older submitted → Đã gửi, superseded → Đã thay thế. | task-03 command |
| AC-04 | When no customer is chosen, the project select shall search every visible project on the server and picking one shall set its customer; when the customer changes to another, a project of a different customer shall be cleared. | task-04 command |
| AC-05 | If a request with blank technical requirements and zero attachments is assigned, the API shall answer 409 and the UI shall show a localized toast. | task-05 command |
| AC-06 | When files are chosen in the create modal, each shall be uploaded after the request is created; a failed file shall be named in a toast without undoing the request, and the request shall be created once. | task-06 command |

## Tasks
| # | Task | Priority | Criteria | Primary ownership | Dependencies | Status |
|---|---|---|---|---|---|---|
| 01 | Rename labels | P1 | AC-01 | `frontend/src/kernel/langs/vi/*.json`, `docs/user-flow-guide.md` | - | done |
| 02 | Detail close button | P2 | AC-02 | `DetailPageLayout.tsx` + six input screens | - | done |
| 03 | Single estimate badge | P2 | AC-03 | `EstimateStatusBadge.tsx` + callers | - | done |
| 04 | Two-way customer/project pick | P2 | AC-04 | `RequestFormFields.tsx` | 01 | done |
| 05 | Assign guard | P1 | AC-05 | `request.service.ts` (backend), request specs, three e2e, request toast mapping (frontend) | 01 | done |
| 06 | Attach files at create | P1 | AC-06 | `RequestFormModal.tsx` | 04, 05 | done |

## Risks
- `docs/user-flow-guide.md` has uncommitted edits from `specs/director-and-price-access/task-11-docs.md`; task-01 edits only the "Công trình"/"Thắng thầu" words and must keep those edits.

## Review log
- Round 1 (GATE-REVIEW 2026-11-11, three fresh reviewers): 12 findings (1 High, 11 Medium). User: R-02 hide X on input screens + cancel icon `ban`; R-04 server-side project search; R-07 keep "Đã gửi"; R-01, R-03, R-05, R-06, R-08–R-12 accepted as proposed. Repaired in task-01..06 and D-03/D-05/D-06, AC-02..AC-06. Closure pass (fresh reviewer): R-02..R-12 PASS; R-01 FAIL (missed caller `request.service.spec.ts:278-291`) plus two gaps inside accepted findings (AC-05 UI probe; selected async option label for R-04) → repaired in task-05 Steps 2-3 and task-04 Step 2; task-03 Outcome adds the older-revision "Đã gửi"; task-01 command checks `status.json` `won`. No new user semantics.
- Sweep: 7 files reread / 5 deltas / 4 stale references fixed / 0 conflicts left. Round 2 is the last paper round.
