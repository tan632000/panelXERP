"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import api from "@/kernel/core/api/api";
import { hasPermission } from "@/kernel/core/auth/tokens";
import { formatIsoDate, formatNumber } from "@/kernel/core/lib/formatters";

import type { InfiniteData } from "@tanstack/react-query";

/** One record of the kernel notification capability, carrying this caller's read flag. */
export interface NotificationItem {
  id: number;
  eventType: string;
  message: string | null;
  link: string | null;
  payload: Record<string, unknown>;
  status: string;
  createdAt: string;
  isRead: boolean;
}

/**
 * One keyset page of the list endpoint. `nextCursor` is the id of the last row of the page
 * and null once nothing older is left, so the panel loads more only while the server still
 * has records instead of pulling the whole inbox on open.
 */
export interface NotificationListPage {
  data: NotificationItem[];
  nextCursor: number | null;
}

/** Rows one page request asks for. */
export const NOTIFICATION_PAGE_SIZE = 20;

/** Shared status marking a notification closed for every recipient. */
export const NOTIFICATION_RESOLVED_STATUS = "resolved";

/**
 * Scopes the emitted notification types require — one entry per module that emits, since a
 * record is only readable by an actor holding the scope its emitter stamped on it. An actor
 * holding none of them can never read any record, so the navigation renders no bell at all
 * rather than an empty panel. `purchase_request:read` covers the six PR events: the
 * purchasing team carries it without ever being granted `product:notify`, so gating on the
 * product scope alone hid their entire PR inbox behind a bell that never rendered.
 */
export const NOTIFICATION_REQUIRED_SCOPES = [
  "product:notify",
  "purchase_request:read",
  // Each work-order book stamps its records with its own read scope; planning and the
  // mechanical shop hold it without ever holding either of the two above, so leaving it out
  // hid their whole inbox behind a bell that never rendered.
  "work_order_master:read",
  "work_order_sub:read",
  "work_order_wire_drawing:read",
  // VTTM's 3 actor-driven triggers + the fully-delivered reminder are stamped with this
  // scope; Sales holds it without necessarily holding any of the scopes above.
  "commercial_material_revenue:read",
  // `sales-phieu-giao-mau-v01.md` Requirement 9 stamps every sample-delivery-note record with
  // this scope; QC-Lab and the two shop-manager roles currently also hold a work-order read scope,
  // so this is a latent dependency rather than a rendering fix — but the bell must stop
  // relying on that coincidence.
  "sample_delivery_note:read",
  // `sales-sample-order-v01.md` Requirement 11 stamps every sample-order record with this one.
  "sample_order:read",
  // `giao-hang-gia-cong-dich-vu-v01.md` Requirement 12 stamps every service delivery note
  // record with this one; the accounting roles hold it without any scope above.
  "service_delivery_note:read",
  // `giao-hang-xuat-ban-vttm-v01.md` Requirement 13 stamps every commercial goods delivery
  // note record with this one.
  "commercial_goods_delivery_note:read",
  // `ke-hoach-mrp-v01.md` Requirement 11 stamps every MRP record with this one.
  "mrp:read",
  // The RFQ technical-input and overdue-quote records; the technical roles hold nothing above.
  "rfq:read",
  // Every delivery-plan record (created, rescheduled, cancelled, shortage), stamped with its
  // plan type's own read scope.
  "delivery_plan_domestic:read",
  "delivery_plan_export:read",
  // The IQC/OQC edit-approval and director records, stamped with each family's own scope.
  "iqc_raw_material:read",
  "iqc_commercial_goods:read",
  "iqc_tool_equipment:read",
  "iqc_other_material:read",
  "iqc_xlbm_material:read",
  "oqc_finished_product:read",
  "oqc_xlbm_material:read",
  // `qc-lab-quan-ly-hieu-chuan-v01.md` Requirement 9 stamps every calibration reminder with
  // this scope; the equipment-owning departments hold it without holding any scope above.
  "equipment_calibration:read",
  // Test-lab, service SO (SO dich vu) and maintenance records each carry their own scope.
  "capa:read",
  "capa_claim:read",
  "test_lab:read",
  "service_revenue:read",
  "maintenance_registration:read",
  // The BTP OK receipt's
  // pending-QC notice is stamped with the semi-finished receipt scope.
  "semi_finished_receipt_ok:read",
  // The sales request assignment record names the engineer it is for; engineers hold this
  // scope and none of the above.
  "request:read",
  // The low-stock record goes to purchasing, stamped with the stock list scope.
  "stock:read",
] as const;

/** Badge stops counting past this and renders the overflow marker instead. */
export const NOTIFICATION_BADGE_MAX = 99;

/**
 * Event types this client can phrase itself. A record stores no display language, so a
 * known event is rendered from its payload through the message bundle and an unknown one
 * falls back to whatever denormalised text the emitter supplied.
 */
export const NOTIFICATION_EVENT_KEYS = [
  "sp_can_bo_sung_ky_thuat",
  "sales.request.assigned",
  "sales.estimate.submitted",
  "sales.quotation.submitted",
  "sales.quotation.approved",
  "sales.quotation.rejected",
  "sales.order.created",
  "inventory.stock.low",
  "purchaseRequestAwaitingReceipt",
  "purchaseRequestReceived",
  "purchaseRequestApproved",
  "purchaseRequestInProgress",
  "purchaseRequestCompleted",
  "purchaseRequestCancelledByRequester",
  "purchaseRequestCancelledByPurchasing",
  "purchaseRequestUrgent",
  "po_da_ghi_nhan",
  "po_cho_duyet",
  "po_da_duyet",
  "po_bi_huy",
  "po_dang_thuc_hien",
  "po_hoan_thanh",
  "po_mo_lai",
  "po_moi_can_trien_khai",
  "po_lan_giao_chua_ty_gia",
  "mrp_cho_duyet",
  "mrp_da_duyet",
  "mrp_san_sang_tao_po",
  "mrp_bi_huy",
  "pogc_moi",
  "pogc_bi_huy",
  "pogc_hoan_thanh",
  "pogc_mo_lai",
  "lsx_ma_da_duyet",
  "lsx_da_duyet_toan_lenh",
  "lsx_ma_bi_bo_duyet",
  "lsx_thu_hoi_toan_lenh",
  "lsx_ma_bi_huy",
  "lsx_ma_da_dong",
  "lsx_ma_da_mo_lai",
  "lsx_gd_vua_tao",
  "lsx_tu_tao_tu_duyet",
  "lsx_den_han",
  "lsx_qua_han",
  "lenh_rut_day_moi",
  "lenh_rut_day_bi_huy",
  "lenh_rut_day_bi_huy_co_ct",
  "lenh_rut_day_dong_som",
  "lenh_rut_day_mo_lai",
  "lenh_rut_day_bo_huy",
  "btp_receipt_pending_qc",
  "ldd_lenh_moi",
  "ldd_bi_huy",
  "ldd_bi_huy_co_ct",
  "ldd_dong_som",
  "ldd_mo_lai",
  "ldd_bo_huy",
  "so_da_tao",
  "so_dieu_chinh_balance",
  "so_bi_huy",
  "so_da_dong",
  "so_mo_lai",
  "sorting_moi",
  "sorting_da_dong",
  "sorting_mo_lai",
  "dgdb_da_dong",
  "dgdb_mo_lai",
  "lap_rap_da_dong",
  "lap_rap_mo_lai",
  "sorting_ng_vuot_nguong",
  "dgdb_moi",
  "dgdb_ng_vuot_nguong",
  "lap_rap_moi",
  "lap_rap_ng_vuot_nguong",
  "xlnl_moi",
  "xlnl_da_xuat",
  "nghuy_moi",
  "nghuy_qc_duyet",
  "nghuy_gd_duyet",
  "sample_delivery_note.created",
  "sample_delivery_note.ready_to_deliver",
  "sample_delivery_note.ng_pending",
  "sample_delivery_note.delivered",
  "tooling_order_can_bo_sung_ky_thuat",
  "tooling_order_cho_duyet_buoc1",
  "tooling_order_cho_duyet_gd",
  "tooling_order_da_duyet",
  "tooling_order_bi_huy",
  "tooling_order_bi_huy_hang_loat",
  "sample_order_can_bo_sung_ky_thuat",
  "sample_order_cho_duyet_buoc1",
  "sample_order_cho_duyet_gd",
  "sample_order_da_duyet",
  "sample_order_kh_feedback",
  "sample_order_bi_huy",
  "sample_order_bi_huy_hang_loat",
  "sample_order_da_giao",
  "sample_order_kiem_mau_khong_dat",
  "corrosion_test_edit_proposed",
  "corrosion_test_edit_decided",
  "corrosion_test_director_created",
  "corrosion_test_director_edited",
  "oqc_sample_edit_proposed",
  "oqc_sample_edit_decided",
  "oqc_sample_director_created",
  "oqc_sample_director_edited",
  "oqc_fp_edit_proposed",
  "oqc_fp_edit_decided",
  "oqc_fp_director_created",
  "oqc_fp_director_edited",
  "oqc_xlbm_edit_proposed",
  "oqc_xlbm_edit_decided",
  "oqc_xlbm_director_created",
  "oqc_xlbm_director_edited",
  "fp_qc_standard_approved",
  "other_material_receipt_ok_awaiting_approval",
  "other_material_receipt_ng_awaiting_approval",
  "raw_material_receipt_awaiting_approval",
  "commercial_material_revenue_created",
  "commercial_material_revenue_closed",
  "commercial_material_revenue_reopened",
  "commercial_material_revenue_fully_delivered",
  "service_revenue_created",
  "service_revenue_closed",
  "service_revenue_reopened",
  "service_revenue_fully_delivered",
  "delivery_note_created",
  "delivery_note_created_needs_price",
  "delivery_note_issued",
  "delivery_note_delivered",
  "delivery_note_delivery_recalled",
  "delivery_note_edit_requested",
  "delivery_note_edit_approved",
  "delivery_note_edit_rejected",
  "delivery_note_cancel_requested",
  "delivery_note_cancel_approved",
  "delivery_note_cancel_rejected",
  "delivery_note_return_scan_completed",
  "service_delivery_note_created",
  "service_delivery_note_delivered",
  "service_delivery_note_edit_requested",
  "service_delivery_note_edit_approved",
  "service_delivery_note_edit_rejected",
  "service_delivery_note_cancel_requested",
  "service_delivery_note_cancel_approved",
  "service_delivery_note_cancel_rejected",
  "service_delivery_note_cancel_withdrawn",
  "service_delivery_note_cancel_recalled",
  "service_delivery_note_deleted",
  "service_delivery_note_bulk_deleted",
  "service_delivery_note_director_edited",
  "service_delivery_note_director_cancelled",
  "service_delivery_note_delivery_recalled",
  "service_delivery_note_price_needed",
  "service_delivery_note_lines_deleted",
  "commercial_goods_delivery_note_created",
  "commercial_goods_delivery_note_delivered",
  "commercial_goods_delivery_note_edit_requested",
  "commercial_goods_delivery_note_edit_approved",
  "commercial_goods_delivery_note_edit_rejected",
  "commercial_goods_delivery_note_cancel_requested",
  "commercial_goods_delivery_note_cancel_approved",
  "commercial_goods_delivery_note_cancel_rejected",
  "commercial_goods_delivery_note_deleted",
  "commercial_goods_delivery_note_director_edited",
  "commercial_goods_delivery_note_director_cancelled",
  "commercial_goods_delivery_note_created_by_keeper",
  "commercial_goods_delivery_note_delivery_recalled",
  "signature_review_requested",
  "signature_review_approved",
  "signature_review_rejected",
  "rfq_can_bo_sung_ky_thuat",
  "rfq_tre_han_bao_gia",
  "delivery_plan.created",
  "delivery_plan.schedule_changed",
  "delivery_plan.cancelled",
  "delivery_plan.shortage",
  "xlbm_issue_ok_pending_qc",
  "xlbm_issue_ok_qc_decided",
  "xlbm_issue_ok_subcontract",
  "xlbm_issue_ok_return_supplier",
  "xlbm_issue_ng_return_supplier",
  "xlbm_material_request_created",
  "xlbm_material_request_line_partial",
  "xlbm_material_request_line_issued",
  "xlbm_material_request_overdue",
  "maintenance_activity_due_soon",
  "maintenance_activity_overdue",
  "tool_equipment_issue_subcontract",
  "tool_equipment_issue_return_to_supplier",
  "iqc-raw-material.edit-proposed",
  "iqc-raw-material.edit-level2-pending",
  "iqc-raw-material.edit-decided",
  "iqc-raw-material.director-created",
  "iqc-raw-material.director-edited",
  "iqc-commercial.edit-proposed",
  "iqc-commercial.edit-decided",
  "iqc-commercial.director-created",
  "iqc-commercial.director-edited",
  "iqc-tool-equipment.edit-proposed",
  "iqc-tool-equipment.edit-decided",
  "iqc-tool-equipment.director-created",
  "iqc-tool-equipment.director-edited",
  "iqc-other-material.edit-proposed",
  "iqc-other-material.edit-decided",
  "iqc-other-material.director-created",
  "iqc-other-material.director-edited",
  "iqc-xlbm.edit-proposed",
  "iqc-xlbm.edit-decided",
  "iqc-xlbm.director-created",
  "iqc-xlbm.director-edited",
  "oqc-fp.edit-proposed",
  "oqc-fp.edit-decided",
  "oqc-fp.director-created",
  "oqc-fp.director-edited",
  "oqc-xlbm.edit-proposed",
  "oqc-xlbm.edit-decided",
  "oqc-xlbm.director-created",
  "oqc-xlbm.director-edited",
  "equipment_calibration_failed",
  "equipment_calibration_due_soon",
  "equipment_calibration_overdue",
  "rnd_da_huy",
  "kke_inventory_pending_approval",
  "kke_inventory_approved",
  "capa.assigned",
  "capa.submitted",
  "capa.tp-approved",
  "capa.approved",
  "capa.rejected",
  "capa.recalled",
  "capa.overdue",
  "yctn.created",
  "yctn.handler_changed",
  "yctn.started",
  "yctn.closed",
  "yctn.reopened",
  "yctn.cancelled",
  "yctn.uncancelled",
  "yctn.result_updated",
  "test_lab_created",
  "test_lab_approved",
  "test_lab_rejected",
  "test_lab_approval_revoked",
  "test_lab_result_available",
  "test_lab_overdue",
] as const;

/**
 * Event types the Lab analysis-data group emits (`lab-rnd-v01.md` Req 6,
 * `lab-tieu-hao-hoa-chat-v01.md` Req 8) — keyed on the slip/project code,
 * with the acting user's name and the reason filled in where the phrasing
 * names them.
 */
const QC_LAB_ANALYSIS_EVENT_KEYS = new Set<string>([
  "rnd_da_huy",
  "kke_inventory_pending_approval",
  "kke_inventory_approved",
]);

/**
 * Event types the corrosion test emits (Test an mon, Function List 6.9-6.11).
 * One decided event carries three outcomes — approved, rejected, silently
 * superseded — distinguished by the payload, each with its own phrasing.
 */
const CORROSION_TEST_EVENT_KEYS = new Set<string>([
  "corrosion_test_edit_proposed",
  "corrosion_test_edit_decided",
  "corrosion_test_director_created",
  "corrosion_test_director_edited",
]);

/**
 * Event types the OQC sample module emits
 * (`outgoing-qc-hang-mau-v01.md` Requirement 3 AC12, Requirement 5 AC10).
 * One decided event carries three outcomes — approved, rejected, silently
 * superseded — distinguished by the payload, each with its own phrasing.
 */
const OQC_SAMPLE_EVENT_KEYS = new Set<string>([
  "oqc_sample_edit_proposed",
  "oqc_sample_edit_decided",
  "oqc_sample_director_created",
  "oqc_sample_director_edited",
]);

/**
 * Event types the OQC finished-product module emits
 * (`outgoing-qc-thanh-pham-v01.md` Requirement 3 AC13, Requirement 5 AC9).
 * Underscore bus names like every other QC family, so the bundle keys match
 * directly. One decided event carries three outcomes — approved, rejected,
 * silently superseded — distinguished by the payload, each with its own
 * phrasing.
 */
const OQC_FP_EVENT_KEYS = new Set<string>([
  "oqc_fp_edit_proposed",
  "oqc_fp_edit_decided",
  "oqc_fp_director_created",
  "oqc_fp_director_edited",
]);

/**
 * Event types the OQC XLBM-material module emits. Underscore bus names since the rename from
 * the dotted `oqc-xlbm.*` family, phrased exactly like the OQC finished-product ones.
 */
const OQC_XLBM_EVENT_KEYS = new Set<string>([
  "oqc_xlbm_edit_proposed",
  "oqc_xlbm_edit_decided",
  "oqc_xlbm_director_created",
  "oqc_xlbm_director_edited",
]);

/** Wire-drawing order lifecycle (`san-xuat-lenh-rut-day-v01` Requirement 12). */
const WIRE_DRAWING_EVENT_KEYS = new Set<string>([
  "lenh_rut_day_moi",
  "lenh_rut_day_bi_huy",
  "lenh_rut_day_bi_huy_co_ct",
  "lenh_rut_day_dong_som",
  "lenh_rut_day_mo_lai",
  "lenh_rut_day_bo_huy",
]);

/** The XLBM material request lifecycle — payload-only, phrased from the request line. */
const XLBM_MATERIAL_REQUEST_EVENT_KEYS = new Set<string>([
  "xlbm_material_request_created",
  "xlbm_material_request_line_partial",
  "xlbm_material_request_line_issued",
  "xlbm_material_request_overdue",
]);

/** The two maintenance reminders — one line of a registration entering or passing its due date. */
const MAINTENANCE_ACTIVITY_EVENT_KEYS = new Set<string>([
  "maintenance_activity_due_soon",
  "maintenance_activity_overdue",
]);

/** Test-lab request lifecycle; departments, statuses and results arrive as enum values. */
const TEST_LAB_EVENT_KEYS = new Set<string>([
  "test_lab_created",
  "test_lab_approved",
  "test_lab_rejected",
  "test_lab_approval_revoked",
  "test_lab_result_available",
  "test_lab_overdue",
]);

/**
 * Event type the finished-product standard approval emits
 * (`outgoing-qc-thanh-pham-v01.md` Requirement 2 AC7): the director confirming
 * a pending standard change notifies the proposer.
 */
const FP_QC_STANDARD_EVENT_KEYS = new Set<string>(["fp_qc_standard_approved"]);

/** VTK goods receipts with post-stocktake counts awaiting the Director (Requirement 5 AC8). */
const OTHER_MATERIAL_RECEIPT_APPROVAL_EVENT_KEYS = new Set<string>([
  "other_material_receipt_ok_awaiting_approval",
  "other_material_receipt_ng_awaiting_approval",
]);

/**
 * Event types the equipment calibration module emits
 * (`qc-lab-quan-ly-hieu-chuan-v01.md` Requirement 9): a failing verdict
 * notifies on save, while the daily sweep reminds about newest records
 * entering the due-soon window or passing their next date.
 */
const EQUIPMENT_CALIBRATION_EVENT_KEYS = new Set<string>([
  "equipment_calibration_failed",
  "equipment_calibration_due_soon",
  "equipment_calibration_overdue",
]);

/**
 * Event types the two-step CAPA workflow emits (`qc-capa-noi-bo-v01.md` /
 * `qc-capa-claim-khach-hang-v01.md` Requirement 8), keyed on the CAPA code. The emitter
 * stores no text, so without a phrasing here the bell shows only the neutral line.
 */
const CAPA_EVENT_KEYS = new Set<string>([
  "capa.assigned",
  "capa.submitted",
  "capa.tp-approved",
  "capa.approved",
  "capa.rejected",
  "capa.recalled",
  "capa.overdue",
]);

/**
 * Event types the test request emits (`qc-lab-yeu-cau-thu-nghiem-v01.md` Requirement 9),
 * keyed on the request code; departments, statuses and results arrive as enum values.
 */
const TEST_REQUEST_EVENT_KEYS = new Set<string>([
  "yctn.created",
  "yctn.handler_changed",
  "yctn.started",
  "yctn.closed",
  "yctn.reopened",
  "yctn.cancelled",
  "yctn.uncancelled",
  "yctn.result_updated",
]);

/**
 * Event types the Sub work order emits. Their phrasing names the run, the plan it came from
 * and — for the two cancel variants — what the run had already consumed and delivered, so all
 * of that travels in the payload.
 */
const WORK_ORDER_SUB_EVENT_KEYS = new Set<string>([
  "ldd_lenh_moi",
  "ldd_bi_huy",
  "ldd_bi_huy_co_ct",
  "ldd_dong_som",
  "ldd_mo_lai",
  "ldd_bo_huy",
]);

/**
 * Event types the Master work order emits. Their phrasing names the order and, for a
 * single-product move, the product on it — so both travel in the payload and are filled in
 * below rather than being looked up again.
 */
const WORK_ORDER_MASTER_EVENT_KEYS = new Set<string>([
  "lsx_ma_da_duyet",
  "lsx_da_duyet_toan_lenh",
  "lsx_ma_bi_bo_duyet",
  "lsx_thu_hoi_toan_lenh",
  "lsx_ma_bi_huy",
  "lsx_ma_da_dong",
  "lsx_ma_da_mo_lai",
  "lsx_gd_vua_tao",
  "lsx_tu_tao_tu_duyet",
]);

/** Event types the purchase-request module emits (Requirement 11/12) — payload-only, no
 * backend `message` string, same convention as `sp_can_bo_sung_ky_thuat`. */
const PURCHASE_REQUEST_EVENT_KEYS = new Set<string>([
  "purchaseRequestAwaitingReceipt",
  "purchaseRequestReceived",
  "purchaseRequestApproved",
  "purchaseRequestInProgress",
  "purchaseRequestCompleted",
  "purchaseRequestCancelledByRequester",
  "purchaseRequestCancelledByPurchasing",
]);

/** Event types the purchase-order module emits (Requirement 10) — keyed on `poNo`, with the
 * source code and the cancel reason filled in where the phrasing names them. */
const PURCHASE_ORDER_EVENT_KEYS = new Set<string>([
  "po_da_ghi_nhan",
  "po_cho_duyet",
  "po_da_duyet",
  "po_bi_huy",
  "po_dang_thuc_hien",
  "po_hoan_thanh",
  "po_mo_lai",
  "po_moi_can_trien_khai",
]);

/** Event types the MRP module emits (Requirement 11) — keyed on `mrpId`, with the material
 * name and the cancel reason filled in where the phrasing names them. */
const MRP_EVENT_KEYS = new Set<string>([
  "mrp_cho_duyet",
  "mrp_da_duyet",
  "mrp_san_sang_tao_po",
  "mrp_bi_huy",
]);

/**
 * Event types the three packaging stages emit (Requirement 8) — payload-only, phrased here.
 *
 * `statusLabel` and `actorName` are resolved below rather than sent from the backend, which
 * keeps Vietnamese out of server code the way the procurement events already do.
 */
const PACKAGING_EVENT_KEYS = new Set<string>([
  "sorting_moi",
  "sorting_da_dong",
  "sorting_mo_lai",
  "dgdb_da_dong",
  "dgdb_mo_lai",
  "lap_rap_da_dong",
  "lap_rap_mo_lai",
  "sorting_ng_vuot_nguong",
  "dgdb_moi",
  "dgdb_ng_vuot_nguong",
  "lap_rap_moi",
  "lap_rap_ng_vuot_nguong",
]);

/** Event types the subcontract-order module emits (Requirement 9) — keyed on the order's
 * own business code, plus the cancel reason on the cancellation line. */
const SUBCONTRACT_ORDER_EVENT_KEYS = new Set<string>([
  "pogc_moi",
  "pogc_bi_huy",
  "pogc_hoan_thanh",
  "pogc_mo_lai",
]);

/**
 * Event types the sample-delivery-note module emits (`sales-phieu-giao-mau-v01.md` Requirement
 * 9) — keyed on the note's own code and the customer name, exactly as the AC1-3 UI copy
 * checklist phrases them. `sample_delivery_note.delivered` is not in this set: it carries two
 * distinct payload shapes (the whole-note Sales notice vs. the per-tooling-order-line one) and
 * is resolved separately below.
 */
const SAMPLE_DELIVERY_NOTE_EVENT_KEYS = new Set<string>([
  "sample_delivery_note.created",
  "sample_delivery_note.ready_to_deliver",
  "sample_delivery_note.ng_pending",
]);

/**
 * The bundle key for one sample-delivery-note event: its dotted `eventType`, `_`-joined —
 * `next-intl` reads a literal `.` in a message key as namespace nesting, so the event-bus
 * name (`sample_delivery_note.created`) cannot be looked up as-is.
 */
function sampleDeliveryNoteMessageKey(eventType: string): string {
  return eventType.replace(/\./g, "_");
}

/** Event types the sales-order module emits (Requirement 10) — keyed on the order's own
 * business code, with the balance-adjustment values and the cancel reason filled in where
 * the phrasing names them. */
/**
 * Event types the tooling order emits (Requirement 12) — keyed on the order's own code, with
 * the product and customer that identify it, plus the reason on the cancellation lines and the
 * code list on the batch one.
 */
const TOOLING_ORDER_EVENT_KEYS = new Set<string>([
  "tooling_order_can_bo_sung_ky_thuat",
  "tooling_order_cho_duyet_buoc1",
  "tooling_order_cho_duyet_gd",
  "tooling_order_da_duyet",
  "tooling_order_bi_huy",
  "tooling_order_bi_huy_hang_loat",
]);

/**
 * Event types the sample order emits (Requirement 11) — keyed on the order's own code, with the
 * product and customer that identify it, the reason on the cancellation lines and the code
 * list on the batch one.
 */
const SAMPLE_ORDER_EVENT_KEYS = new Set<string>([
  "sample_order_can_bo_sung_ky_thuat",
  "sample_order_cho_duyet_buoc1",
  "sample_order_cho_duyet_gd",
  "sample_order_da_duyet",
  "sample_order_kh_feedback",
  "sample_order_bi_huy",
  "sample_order_bi_huy_hang_loat",
  "sample_order_da_giao",
  "sample_order_kiem_mau_khong_dat",
]);

const SALES_ORDER_EVENT_KEYS = new Set<string>([
  "so_da_tao",
  "so_dieu_chinh_balance",
  "so_bi_huy",
  "so_da_dong",
  "so_mo_lai",
]);

/** Event types the commercial-material-revenue (VTTM) module emits (Requirement 8) — keyed
 * on the order's own business code, with the acting user's name filled in for the 3
 * actor-driven triggers; the fully-delivered reminder is system-detected and carries no
 * actor. */
const COMMERCIAL_MATERIAL_REVENUE_EVENT_KEYS: Record<string, true> = {
  commercial_material_revenue_created: true,
  commercial_material_revenue_closed: true,
  commercial_material_revenue_reopened: true,
  commercial_material_revenue_fully_delivered: true,
  // Service SO (SO dich vu) shares the shape: code + customer, no actor in the phrasing.
  service_revenue_created: true,
  service_revenue_closed: true,
  service_revenue_reopened: true,
  service_revenue_fully_delivered: true,
};

/** Event types the product delivery note emits (Requirement 11) — keyed on the note number,
 * named with the acting user and the customer; a recall also carries its reason. */
const DELIVERY_NOTE_EVENT_KEYS = new Set<string>([
  "delivery_note_created",
  "delivery_note_created_needs_price",
  "delivery_note_issued",
  "delivery_note_delivered",
  "delivery_note_delivery_recalled",
  "delivery_note_edit_requested",
  "delivery_note_edit_approved",
  "delivery_note_edit_rejected",
  "delivery_note_cancel_requested",
  "delivery_note_cancel_approved",
  "delivery_note_cancel_rejected",
  "delivery_note_return_scan_completed",
]);

/** Event types the service delivery note emits (Requirement 12) — keyed on the note number;
 * the recall names the status the note returned to, a batch delete only counts the notes. */
const COMMERCIAL_GOODS_DELIVERY_NOTE_EVENT_KEYS = new Set<string>([
  "commercial_goods_delivery_note_created",
  "commercial_goods_delivery_note_delivered",
  "commercial_goods_delivery_note_edit_requested",
  "commercial_goods_delivery_note_edit_approved",
  "commercial_goods_delivery_note_edit_rejected",
  "commercial_goods_delivery_note_cancel_requested",
  "commercial_goods_delivery_note_cancel_approved",
  "commercial_goods_delivery_note_cancel_rejected",
  "commercial_goods_delivery_note_deleted",
  "commercial_goods_delivery_note_director_edited",
  "commercial_goods_delivery_note_director_cancelled",
  "commercial_goods_delivery_note_created_by_keeper",
  "commercial_goods_delivery_note_delivery_recalled",
]);

const SERVICE_DELIVERY_NOTE_EVENT_KEYS = new Set<string>([
  "service_delivery_note_created",
  "service_delivery_note_delivered",
  "service_delivery_note_edit_requested",
  "service_delivery_note_edit_approved",
  "service_delivery_note_edit_rejected",
  "service_delivery_note_cancel_requested",
  "service_delivery_note_cancel_approved",
  "service_delivery_note_cancel_rejected",
  "service_delivery_note_cancel_withdrawn",
  "service_delivery_note_cancel_recalled",
  "service_delivery_note_deleted",
  "service_delivery_note_bulk_deleted",
  "service_delivery_note_director_edited",
  "service_delivery_note_director_cancelled",
  "service_delivery_note_delivery_recalled",
  "service_delivery_note_price_needed",
  "service_delivery_note_lines_deleted",
]);

/**
 * The IQC/OQC families sharing `IqcNotiBaseService` (`qc-lab/_shared/notifications`): each
 * emits `<prefix>.edit-proposed | edit-decided | director-created | director-edited` with the
 * same payload — the record code, its material and, for IQC, the receipt it inspects.
 */
const QC_RECORD_EVENT_PREFIXES = new Set<string>([
  "iqc-raw-material",
  "iqc-commercial",
  "iqc-tool-equipment",
  "iqc-other-material",
  "iqc-xlbm",
  "oqc-fp",
  "oqc-xlbm",
]);

/** Event types the XLBM warehouse issue emits, all phrased from the issue-line notice. */
const XLBM_ISSUE_EVENT_KEYS = new Set<string>([
  "xlbm_issue_ok_pending_qc",
  "xlbm_issue_ok_qc_decided",
  "xlbm_issue_ok_subcontract",
  "xlbm_issue_ok_return_supplier",
  "xlbm_issue_ng_return_supplier",
]);

/** Event types the CCDC warehouse issue emits, one per subcontract or return line. */
const TOOL_EQUIPMENT_ISSUE_EVENT_KEYS = new Set<string>([
  "tool_equipment_issue_subcontract",
  "tool_equipment_issue_return_to_supplier",
]);

/** The four CCDC sub-warehouses an issue is raised from, named in its phrasing. */
const TOOL_EQUIPMENT_WAREHOUSES = new Set<string>([
  "okNew",
  "okUsed",
  "ngNew",
  "ngUsed",
]);

/** Event types the delivery plan emits — dotted event-bus names, `_`-joined in the bundle. */
const DELIVERY_PLAN_EVENT_KEYS = new Set<string>([
  "delivery_plan.created",
  "delivery_plan.schedule_changed",
  "delivery_plan.cancelled",
  "delivery_plan.shortage",
]);

/** The bundle key of an event: `next-intl` reads a literal `.` as namespace nesting. */
function eventMessageKey(eventType: string): string {
  return `events.${eventType.replace(/\./g, "_")}`;
}

/**
 * A payload number — a quantity, weight, percent or count, raw or a stored decimal such as
 * `1234.5000` — in the system's number format (`1.234,5`): trailing zeros dropped, up to the
 * four decimals the warehouse stores. A value that does not parse is shown as it came.
 */
function displayNumber(value: unknown): string {
  const raw = String(value ?? "").trim();
  const number = Number(raw);
  return raw && Number.isFinite(number)
    ? formatNumber(number, { maximumFractionDigits: 4 })
    : raw || "-";
}

export type NotificationMessage =
  | { kind: "text"; text: string }
  | {
      kind: "key";
      key: string;
      values: Record<string, string>;
      /** Extra rows under the headline, one per item of a digest notice. */
      lines?: Array<{ key: string; values: Record<string, string> }>;
    };

export const notificationApiRoutes = {
  list: "/notifications",
  unreadCount: "/notifications/unread-count",
  markAllRead: "/notifications/read-all",
  markRead: (id: number) => `/notifications/${id}/read`,
} as const;

export const notificationQueryKeys = {
  all: ["notifications"] as const,
  list: ["notifications", "list"] as const,
  unreadCount: ["notifications", "unread-count"] as const,
};

/** R6.2 — the bell exists only for an actor who can hold a readable notification. */
export function canReadAnyNotification(permissions: string[]): boolean {
  return NOTIFICATION_REQUIRED_SCOPES.some((scope) =>
    hasPermission(permissions, scope),
  );
}

/** R6.1 — no badge at zero; the count itself otherwise, capped at the overflow marker. */
export function formatUnreadBadge(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > NOTIFICATION_BADGE_MAX
    ? `${NOTIFICATION_BADGE_MAX}+`
    : String(Math.trunc(count));
}

/** R6.3 — newest first, with the id breaking a timestamp tie deterministically. */
export function sortNotificationsNewestFirst(
  items: NotificationItem[],
): NotificationItem[] {
  return [...items].sort((left, right) => {
    const byTime =
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    return byTime !== 0 ? byTime : right.id - left.id;
  });
}

export type NotificationTimeUnit =
  "justNow" | "minutesAgo" | "hoursAgo" | "daysAgo";

export interface NotificationTimeParts {
  unit: NotificationTimeUnit;
  count: number;
}

/**
 * R6.3 — relative time as a unit plus a count, so the wording stays in the message
 * bundle instead of being assembled here.
 */
export function toNotificationTimeParts(
  createdAt: string,
  now: Date = new Date(),
): NotificationTimeParts {
  const elapsedMs = now.getTime() - new Date(createdAt).getTime();
  const minutes = Math.floor(Math.max(elapsedMs, 0) / 60_000);
  if (minutes < 1) return { unit: "justNow", count: 0 };
  if (minutes < 60) return { unit: "minutesAgo", count: minutes };

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: "hoursAgo", count: hours };
  return { unit: "daysAgo", count: Math.floor(hours / 24) };
}

/**
 * Whole-day difference between a date and today (negative once overdue), or null when the
 * payload carries no readable date. Older records store a full ISO timestamp rather than the
 * date-only string the emitter writes today, so only the leading `YYYY-MM-DD` is read.
 */
function daysUntilDate(value: string, now: Date = new Date()): number | null {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return null;
  }
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}

/**
 * R6.3 — the row text of one notification: the event's own phrasing when the client knows
 * the event type, the emitter's denormalised text otherwise, and a neutral line last.
 */
export function resolveNotificationMessage(
  item: Pick<NotificationItem, "eventType" | "message" | "payload">,
): NotificationMessage {
  const known = (NOTIFICATION_EVENT_KEYS as readonly string[]).includes(
    item.eventType,
  );

  if (known) {
    const payload = item.payload ?? {};
    const field = (value: unknown) => String(value ?? "").trim() || "-";

    const [qcPrefix, qcAction] = item.eventType.split(".");
    if (QC_RECORD_EVENT_PREFIXES.has(qcPrefix)) {
      const reason = String(payload.reason ?? "").trim();
      const values = {
        code: field(payload.iqcCode),
        materialCode: field(payload.materialCode),
        receiptNo: field(payload.receiptNo),
        editor: field(payload.editorName),
        reason: reason || "-",
        hasReason: reason ? "yes" : "no",
        levelOneApprovedBy: field(payload.levelOneApprovedBy),
        // Only NVL names who rejected; every other family has the director as sole rejecter.
        role: String(payload.decidedByRole ?? "").trim() || "director",
      };
      if (qcAction === "edit-decided") {
        let outcome = "rejected";
        if (payload.superseded === true) outcome = "superseded";
        else if (payload.approved === true) outcome = "approved";
        return {
          kind: "key",
          key: `events.${qcPrefix}_edit-${outcome}`,
          values,
        };
      }
      return { kind: "key", key: eventMessageKey(item.eventType), values };
    }

    if (
      item.eventType === "rfq_can_bo_sung_ky_thuat" ||
      item.eventType === "rfq_tre_han_bao_gia"
    ) {
      return {
        kind: "key",
        key: `events.${item.eventType}`,
        values: {
          rfqCode: field(payload.rfqCode),
          companyName: field(payload.companyName),
          quoteDueDate: payload.quoteDueDate
            ? formatIsoDate(String(payload.quoteDueDate))
            : "-",
        },
      };
    }

    if (XLBM_ISSUE_EVENT_KEYS.has(item.eventType)) {
      // The QC decision carries three outcomes: released and issued, released but short of
      // stock (the line waits for the keeper), and held (the line is cancelled).
      let key = `events.${item.eventType}`;
      if (
        (item.eventType === "xlbm_issue_ok_return_supplier" ||
          item.eventType === "xlbm_issue_ng_return_supplier") &&
        !String(payload.poBalance ?? "").trim()
      ) {
        key = `${key}_noBalance`;
      }
      if (item.eventType === "xlbm_issue_ok_qc_decided") {
        if (payload.verdict === "held") key = "events.xlbm_issue_ok_qc_held";
        else if (payload.shortOfStock === true) {
          key = "events.xlbm_issue_ok_qc_released_short";
        }
      }
      return {
        kind: "key",
        key,
        values: {
          issueNo: field(payload.issueNo),
          lotNo: field(payload.lotNo),
          materialName: field(payload.materialName),
          expiryDate: payload.expiryDate
            ? formatIsoDate(String(payload.expiryDate))
            : "-",
          quantity: displayNumber(payload.quantity),
          unit: String(payload.unit ?? "").trim(),
          referenceNo: field(payload.referenceNo),
          poBalance: displayNumber(payload.poBalance),
        },
      };
    }

    if (WIRE_DRAWING_EVENT_KEYS.has(item.eventType)) {
      return {
        kind: "key",
        key: eventMessageKey(item.eventType),
        values: {
          code: field(payload.code),
          materialBefore: field(payload.materialBefore),
          materialBeforeName: field(payload.materialBeforeName),
          materialAfter: field(payload.materialAfter),
          materialAfterName: field(payload.materialAfterName),
          targetWeightKg: displayNumber(payload.targetWeightKg),
          cancelReason: field(payload.cancelReason),
          materialIssuedKg: displayNumber(payload.materialIssuedKg),
          materialReceivedKg: displayNumber(payload.materialReceivedKg),
          lossKg: displayNumber(payload.lossKg),
          percent: displayNumber(payload.percent),
        },
      };
    }

    if (item.eventType === "btp_receipt_pending_qc") {
      return {
        kind: "key",
        key: "events.btp_receipt_pending_qc",
        values: {
          actorName: field(payload.actorName),
          receiptNo: field(payload.receiptNo),
          pendingCount: displayNumber(payload.pendingCount),
        },
      };
    }

    if (XLBM_MATERIAL_REQUEST_EVENT_KEYS.has(item.eventType)) {
      return {
        kind: "key",
        key: eventMessageKey(item.eventType),
        values: {
          docCode: field(payload.docCode),
          department: field(payload.department),
          requester: field(payload.requester),
          lineCount: displayNumber(payload.lineCount),
          materialCode: field(payload.materialCode),
          issuedQty: displayNumber(payload.issuedQty),
          quantity: displayNumber(payload.quantity),
          unit: String(payload.unit ?? "").trim(),
          needDate: payload.needDate
            ? formatIsoDate(String(payload.needDate))
            : "-",
        },
      };
    }

    if (MAINTENANCE_ACTIVITY_EVENT_KEYS.has(item.eventType)) {
      return {
        kind: "key",
        key: eventMessageKey(item.eventType),
        values: {
          registrationCode: field(payload.registrationCode),
          subjectText: field(payload.subjectText),
          content: field(payload.content),
          nextDueOn: payload.nextDueOn
            ? formatIsoDate(String(payload.nextDueOn))
            : "-",
          days: field(payload.daysRemaining ?? payload.daysOverdue),
        },
      };
    }

    if (TEST_LAB_EVENT_KEYS.has(item.eventType)) {
      return {
        kind: "key",
        key: eventMessageKey(item.eventType),
        values: {
          code: field(payload.testLabCode),
          requestDepartment: field(payload.requestDepartment),
          materialName: field(payload.materialName),
          deadline: payload.deadline
            ? formatIsoDate(String(payload.deadline))
            : "-",
          status: field(payload.status),
          result: field(payload.result),
          reason: field(payload.reason),
        },
      };
    }

    if (TOOL_EQUIPMENT_ISSUE_EVENT_KEYS.has(item.eventType)) {
      // The sub-warehouse is named in the phrasing, so each one has its own bundle entry.
      const warehouse = String(payload.warehouse ?? "");
      const key = TOOL_EQUIPMENT_WAREHOUSES.has(warehouse)
        ? `events.${item.eventType}_${warehouse}`
        : `events.${item.eventType}`;
      return {
        kind: "key",
        key,
        values: {
          issueNo: field(payload.issueNo),
          toolName: field(payload.toolName),
          quantity: displayNumber(payload.quantity),
          unit: String(payload.unit ?? "").trim(),
          // `||`, not `??`: an emitter can store an empty `poNo` beside a filled reference.
          reference: field(payload.poNo || payload.reference),
          // The phrasing words the PO by kind; an empty value falls back to a plain "PO".
          orderKind: String(payload.orderKind ?? "").trim(),
          remainingBalance: displayNumber(payload.remainingBalance),
        },
      };
    }

    if (DELIVERY_PLAN_EVENT_KEYS.has(item.eventType)) {
      let key = eventMessageKey(item.eventType);
      if (item.eventType === "delivery_plan.schedule_changed") {
        const quantityChanged = Number(payload.changedQuantityLines ?? 0) > 0;
        if (payload.etdChanged !== true) {
          key = "events.delivery_plan_quantity_changed";
        } else if (!quantityChanged) {
          key = "events.delivery_plan_etd_changed";
        }
      }
      const date = (value: unknown) =>
        value ? formatIsoDate(String(value)) : "-";
      return {
        kind: "key",
        key,
        values: {
          actorName: field(payload.actorName),
          planCode: field(payload.planCode),
          customerName: field(payload.customerName),
          week: field(payload.week),
          cancelReason: field(payload.cancelReason),
          previousEtd: date(payload.previousEtd),
          nextEtd: date(payload.nextEtd),
          changedQuantityLines: field(payload.changedQuantityLines),
          customerProductCode: field(payload.customerProductCode),
          productName: field(payload.productName),
          deficit: displayNumber(payload.deficit),
          etd: date(payload.etd),
        },
      };
    }

    if (item.eventType === "raw_material_receipt_awaiting_approval") {
      const actorName = String(payload.actorName ?? "").trim();
      return {
        kind: "key",
        key: actorName
          ? "events.raw_material_receipt_awaiting_approval"
          : "events.raw_material_receipt_awaiting_approval_noActor",
        values: {
          actorName,
          receiptNo: field(payload.receiptNo),
          warehouse: String(payload.warehouse ?? "").trim(),
          count: displayNumber(payload.pendingCount),
        },
      };
    }

    if (item.eventType === "sales.request.assigned") {
      return {
        kind: "key",
        key: "events.sales_request_assigned",
        values: { code: field(payload.code), title: field(payload.title) },
      };
    }

    if (item.eventType === "sales.estimate.submitted") {
      return {
        kind: "key",
        key: "events.sales_estimate_submitted",
        values: {
          code: field(payload.code),
          requestCode: field(payload.requestCode),
          revision: displayNumber(payload.revision),
        },
      };
    }

    if (
      item.eventType === "sales.quotation.submitted" ||
      item.eventType === "sales.quotation.approved" ||
      item.eventType === "sales.quotation.rejected"
    ) {
      return {
        kind: "key",
        key: `events.${item.eventType.replace(/\./g, "_")}`,
        values: {
          code: field(payload.code),
          requestCode: field(payload.requestCode),
          ver: displayNumber(payload.ver),
          reason: field(payload.reason),
        },
      };
    }

    if (item.eventType === "sales.order.created") {
      return {
        kind: "key",
        key: "events.sales_order_created",
        values: {
          code: field(payload.code),
          quotationCode: field(payload.quotationCode),
          requestCode: field(payload.requestCode),
        },
      };
    }

    if (item.eventType === "inventory.stock.low") {
      return {
        kind: "key",
        key: "events.inventory_stock_low",
        values: {
          code: field(payload.code),
          name: field(payload.name),
          unit: field(payload.unit),
          available: displayNumber(payload.available),
          minStock: displayNumber(payload.minStock),
        },
      };
    }

    if (PURCHASE_REQUEST_EVENT_KEYS.has(item.eventType)) {
      const prId = String(payload.prId ?? "").trim();
      const department = String(payload.department ?? "").trim();
      const cancelReason = String(payload.cancelReason ?? "").trim();
      return {
        kind: "key",
        key: `events.${item.eventType}`,
        values: {
          prId: prId || "-",
          department: department || "-",
          cancelReason: cancelReason || "-",
        },
      };
    }

    // `mua-hang-po-ty-gia-lan-giao-v01.md` Requirement 5 AC5 — one delivery and several
    // deliveries are phrased differently, so each has its own bundle entry.
    if (item.eventType === "po_lan_giao_chua_ty_gia") {
      const lineCount = Number(payload.lineCount ?? 1);
      const amounts = Array.isArray(payload.amounts)
        ? (payload.amounts as Array<{ currency?: unknown; amount?: unknown }>)
            .map(
              (entry) =>
                `${formatNumber(Number(entry.amount ?? 0), { maximumFractionDigits: 2 })} ${String(entry.currency ?? "")}`,
            )
            .join(", ")
        : "-";
      return {
        kind: "key",
        key:
          lineCount > 1
            ? "events.po_lan_giao_chua_ty_gia_nhieu"
            : "events.po_lan_giao_chua_ty_gia",
        values: {
          poNo: field(payload.poNo),
          count: String(lineCount),
          documentNo: field(payload.documentNo),
          date: payload.documentDate
            ? formatIsoDate(String(payload.documentDate))
            : "-",
          amounts,
        },
      };
    }

    if (PURCHASE_ORDER_EVENT_KEYS.has(item.eventType)) {
      const poNo = String(payload.poNo ?? "").trim();
      const sourceCode = String(payload.sourceCode ?? "").trim();
      const cancelReason = String(payload.cancelReason ?? "").trim();
      return {
        kind: "key",
        key: `events.${item.eventType}`,
        values: {
          poNo: poNo || "-",
          sourceCode: sourceCode || "-",
          cancelReason: cancelReason || "-",
        },
      };
    }

    if (MRP_EVENT_KEYS.has(item.eventType)) {
      return {
        kind: "key",
        key: `events.${item.eventType}`,
        values: {
          mrpId: String(payload.mrpId ?? "").trim() || "-",
          materialName: String(payload.materialName ?? "").trim() || "-",
          cancelReason: String(payload.cancelReason ?? "").trim() || "-",
        },
      };
    }

    if (PACKAGING_EVENT_KEYS.has(item.eventType)) {
      const orderCode = String(payload.orderCode ?? "").trim();
      return {
        kind: "key",
        key: `events.${item.eventType}`,
        values: {
          orderCode: orderCode || "-",
          actorName: String(payload.actorName ?? "").trim() || "-",
          pic: String(payload.pic ?? "").trim() || "-",
          packagingCode: String(payload.packagingCode ?? "").trim() || "-",
          processName: String(payload.processName ?? "").trim() || "-",
          productCode: String(payload.productCode ?? "").trim() || "-",
          quantityPcs: displayNumber(payload.quantityPcs),
          ngPercent: displayNumber(payload.ngPercent),
          thresholdPercent: displayNumber(payload.thresholdPercent),
        },
      };
    }

    if (SUBCONTRACT_ORDER_EVENT_KEYS.has(item.eventType)) {
      const subcontractOrderId = String(
        payload.subcontractOrderId ?? "",
      ).trim();
      const cancelReason = String(payload.cancelReason ?? "").trim();
      return {
        kind: "key",
        key: `events.${item.eventType}`,
        values: {
          subcontractOrderId: subcontractOrderId || "-",
          cancelReason: cancelReason || "-",
        },
      };
    }

    if (SAMPLE_DELIVERY_NOTE_EVENT_KEYS.has(item.eventType)) {
      const noteCode = String(payload.noteCode ?? "").trim();
      const customerName = String(payload.customerName ?? "").trim();
      return {
        kind: "key",
        // next-intl parses `.` as namespace nesting, so the dotted `eventType` the backend
        // uses as its event-bus name is not usable as a literal bundle key — translate to `_`.
        key: `events.${sampleDeliveryNoteMessageKey(item.eventType)}`,
        values: {
          noteCode: noteCode || "-",
          customerName: customerName || "-",
        },
      };
    }

    if (item.eventType === "sample_delivery_note.delivered") {
      const toolingOrderCode = String(payload.toolingOrderCode ?? "").trim();
      if (toolingOrderCode) {
        return {
          kind: "key",
          key: "events.sample_delivery_note_delivered_tooling_order",
          values: {
            toolingOrderCode,
            productName: String(payload.productName ?? "").trim() || "-",
            noteCode: String(payload.noteCode ?? "").trim() || "-",
          },
        };
      }
      return {
        kind: "key",
        key: `events.${sampleDeliveryNoteMessageKey(item.eventType)}`,
        values: {
          noteCode: String(payload.noteCode ?? "").trim() || "-",
          customerName: String(payload.customerName ?? "").trim() || "-",
        },
      };
    }

    if (TOOLING_ORDER_EVENT_KEYS.has(item.eventType)) {
      const codes = Array.isArray(payload.toolingCodes)
        ? (payload.toolingCodes as unknown[]).map(String)
        : [];
      const overflow = Number(payload.overflow ?? 0);
      return {
        kind: "key",
        // A batch past the preview names how many it left out, in a phrasing of its own.
        key:
          overflow > 0
            ? `events.${item.eventType}_more`
            : `events.${item.eventType}`,
        values: {
          toolingCode: String(payload.toolingCode ?? "").trim() || "-",
          productName: String(payload.productName ?? "").trim() || "-",
          customerName: String(payload.customerName ?? "").trim() || "-",
          cancelReason: String(payload.cancelReason ?? "").trim() || "-",
          count: String(payload.count ?? codes.length),
          toolingCodes: codes.join(", "),
          overflow: String(overflow),
        },
      };
    }

    if (SAMPLE_ORDER_EVENT_KEYS.has(item.eventType)) {
      const codes = Array.isArray(payload.sampleCodes)
        ? (payload.sampleCodes as unknown[]).map(String)
        : [];
      const overflow = Number(payload.overflow ?? 0);
      return {
        kind: "key",
        key:
          overflow > 0
            ? `events.${item.eventType}_more`
            : `events.${item.eventType}`,
        values: {
          sampleCode: String(payload.sampleCode ?? "").trim() || "-",
          productName: String(payload.productName ?? "").trim() || "-",
          customerName: String(payload.customerName ?? "").trim() || "-",
          cancelReason: String(payload.cancelReason ?? "").trim() || "-",
          count: String(payload.count ?? codes.length),
          sampleCodes: codes.join(", "),
          overflow: String(overflow),
        },
      };
    }

    if (SALES_ORDER_EVENT_KEYS.has(item.eventType)) {
      const orderCode = String(payload.orderCode ?? "").trim();
      const customerProductCode = String(
        payload.customerProductCode ?? "",
      ).trim();
      const previousValue = String(payload.previousValue ?? "").trim();
      const value = String(payload.value ?? "").trim();
      const cancelReason = String(payload.cancelReason ?? "").trim();
      const actorName = String(payload.actorName ?? "").trim();
      const customerName = String(payload.customerName ?? "").trim();
      // Only the "created" trigger's copy differs by order type (ND: Req10 AC1 domestic vs.
      // export wording); the other 4 triggers share one template regardless of `orderType`.
      const key =
        item.eventType === "so_da_tao"
          ? `events.so_da_tao_${payload.orderType === "export" ? "export" : "domestic"}`
          : `events.${item.eventType}`;
      return {
        kind: "key",
        key,
        values: {
          orderCode: orderCode || "-",
          customerProductCode: customerProductCode || "-",
          previousValue: previousValue || "-",
          value: value || "-",
          cancelReason: cancelReason || "-",
          actorName: actorName || "-",
          customerName: customerName || "-",
        },
      };
    }

    if (DELIVERY_NOTE_EVENT_KEYS.has(item.eventType)) {
      const text = (value: unknown) => String(value ?? "").trim() || "-";
      return {
        kind: "key",
        key: `events.${item.eventType}`,
        values: {
          noteCode: text(payload.noteCode),
          customerName: text(payload.customerName),
          actorName: text(payload.actorName),
          reason: text(payload.reason),
        },
      };
    }

    if (COMMERCIAL_GOODS_DELIVERY_NOTE_EVENT_KEYS.has(item.eventType)) {
      const text = (value: unknown) => String(value ?? "").trim() || "-";
      return {
        kind: "key",
        key: `events.${item.eventType}`,
        values: {
          noteCode: text(payload.noteCode),
          salesOrderNo: text(payload.salesOrderNo),
          customerName: text(payload.customerName),
          actorName: text(payload.actorName),
          reason: text(payload.reason),
          restoredStatus: text(payload.restoredStatus),
        },
      };
    }

    if (SERVICE_DELIVERY_NOTE_EVENT_KEYS.has(item.eventType)) {
      return {
        kind: "key",
        key: `events.${item.eventType}`,
        values: {
          noteCode: String(payload.noteCode ?? "").trim() || "-",
          salesOrderNo: String(payload.salesOrderNo ?? "").trim() || "-",
          restoredStatus: String(payload.restoredStatus ?? "").trim() || "-",
          count: String(payload.count ?? 0),
          actorName: String(payload.actorName ?? "").trim() || "-",
          customerName: String(payload.customerName ?? "").trim() || "-",
          reason: String(payload.reason ?? "").trim() || "-",
        },
      };
    }

    if (QC_LAB_ANALYSIS_EVENT_KEYS.has(item.eventType)) {
      const raw = (key: string) => String(payload[key] ?? "").trim();
      const text = (key: string) => raw(key) || "-";
      return {
        kind: "key",
        key: `events.${item.eventType}`,
        values: {
          code: raw("rndProjectCode") || raw("code") || "-",
          projectName: text("projectName"),
          actorName: raw("actorName") || raw("editorName") || "-",
          lineSx: text("lineSx"),
          reason: text("reason"),
        },
      };
    }

    if (item.eventType in COMMERCIAL_MATERIAL_REVENUE_EVENT_KEYS) {
      const orderCode = String(payload.orderCode ?? "").trim();
      const customerName = String(payload.customerName ?? "").trim();
      const actorName = String(payload.actorName ?? "").trim();
      return {
        kind: "key",
        key: `events.${item.eventType}`,
        values: {
          orderCode: orderCode || "-",
          customerName: customerName || "-",
          actorName: actorName || "-",
        },
      };
    }

    // An account's signature review: the request names who submitted, the rejection why.
    if (item.eventType.startsWith("signature_review_")) {
      return {
        kind: "key",
        key: `events.${item.eventType}`,
        values: {
          fullName: String(payload.fullName ?? "").trim() || "-",
          username: String(payload.username ?? "").trim() || "-",
          reason: String(payload.reason ?? "").trim() || "-",
        },
      };
    }

    if (item.eventType === "purchaseRequestUrgent") {
      const prId = String(payload.prId ?? "").trim();
      const department = String(payload.department ?? "").trim();
      const earliestNeedDate = String(payload.earliestNeedDate ?? "").trim();
      const days = earliestNeedDate ? daysUntilDate(earliestNeedDate) : null;
      return {
        kind: "key",
        key: `events.${item.eventType}`,
        values: {
          prId: prId || "-",
          department: department || "-",
          days: days === null ? "-" : String(days),
        },
      };
    }

    if (WORK_ORDER_SUB_EVENT_KEYS.has(item.eventType)) {
      const text = (key: string) => String(payload[key] ?? "").trim() || "-";
      return {
        kind: "key",
        key: `events.${item.eventType}`,
        values: {
          subCode: text("subCode"),
          masterNo: text("masterNo"),
          productCode: text("productCode"),
          productName: text("productName"),
          qtyPcs: displayNumber(payload.qtyPcs),
          materialCode: text("materialCode"),
          materialWeightKg: displayNumber(payload.materialWeightKg),
          materialIssuedKg: displayNumber(payload.materialIssuedKg),
          receivedQtyPcs: displayNumber(payload.receivedQtyPcs),
          percent: displayNumber(payload.percent),
          cancelReason: text("cancelReason"),
        },
      };
    }

    if (item.eventType === "lsx_den_han" || item.eventType === "lsx_qua_han") {
      const digestItems = Array.isArray(payload.items)
        ? (payload.items as Array<Record<string, unknown>>)
        : [];
      const itemValues = (entry: Record<string, unknown>) => ({
        masterNo: field(entry.masterNo),
        productCode: field(entry.productCode),
        productName: field(entry.productName),
        qtyPcs: displayNumber(entry.qtyPcs),
        receivedQtyPcs: displayNumber(entry.receivedQtyPcs),
        progressPercent: displayNumber(entry.progressPercent),
        overdueDays: displayNumber(entry.overdueDays),
      });
      const count = String(payload.count ?? digestItems.length);
      // Due-today with a single product reads as one sentence; every other digest is a
      // headline plus one row per product.
      if (item.eventType === "lsx_den_han" && digestItems.length === 1) {
        return {
          kind: "key",
          key: "events.lsx_den_han",
          values: { count, ...itemValues(digestItems[0]) },
        };
      }
      return {
        kind: "key",
        key:
          item.eventType === "lsx_qua_han"
            ? "events.lsx_qua_han"
            : "events.lsx_den_han_many",
        values: { count },
        lines: digestItems.map((entry) => ({
          key: `events.${item.eventType}_line`,
          values: itemValues(entry),
        })),
      };
    }

    if (WORK_ORDER_MASTER_EVENT_KEYS.has(item.eventType)) {
      const text = (key: string) => String(payload[key] ?? "").trim() || "-";
      const subOrderCodes = Array.isArray(payload.subOrderCodes)
        ? (payload.subOrderCodes as unknown[]).map(String)
        : [];
      const subOrderCount = Number(payload.subOrderCount ?? 0);
      let key = `events.${item.eventType}`;
      if (item.eventType === "lsx_ma_bi_huy") {
        if (subOrderCodes.length === 0) key = `${key}_noCodes`;
        else if (subOrderCount > subOrderCodes.length) key = `${key}_more`;
      }
      return {
        kind: "key",
        key,
        values: {
          actorName: text("actorName"),
          subOrderCodes: subOrderCodes.join(", "),
          overflow: String(Math.max(subOrderCount - subOrderCodes.length, 0)),
          masterNo: text("masterNo"),
          productCode: text("productCode"),
          productName: text("productName"),
          qtyPcs: displayNumber(payload.qtyPcs),
          dueDate: text("dueDate"),
          lineCount: displayNumber(payload.lineCount),
          cancelReason: text("cancelReason"),
          subOrderCount: displayNumber(payload.subOrderCount),
        },
      };
    }

    if (item.eventType === "xlnl_moi") {
      return {
        kind: "key",
        key: `events.${item.eventType}`,
        values: {
          requestCode: String(payload.requestCode ?? "").trim() || "-",
          productionLine: String(payload.productionLine ?? "").trim() || "-",
          lineCount: displayNumber(payload.lineCount),
          totalQtyPcs: displayNumber(payload.totalQtyPcs),
          actorName: String(payload.actorName ?? "").trim() || "-",
        },
      };
    }

    if (item.eventType === "xlnl_da_xuat") {
      return {
        kind: "key",
        key: `events.${item.eventType}`,
        values: {
          requestCode: String(payload.requestCode ?? "").trim() || "-",
          productCode: String(payload.productCode ?? "").trim() || "-",
          quantityPcs: displayNumber(payload.quantityPcs),
          targetXlbmOrderCode:
            String(payload.targetXlbmOrderCode ?? "").trim() || "-",
          actorName: String(payload.actorName ?? "").trim() || "-",
        },
      };
    }

    if (item.eventType === "nghuy_moi") {
      return {
        kind: "key",
        key: `events.${item.eventType}`,
        values: {
          requestCode: String(payload.requestCode ?? "").trim() || "-",
          productionLine: String(payload.productionLine ?? "").trim() || "-",
          lineCount: displayNumber(payload.lineCount),
          totalQtyPcs: displayNumber(payload.totalQtyPcs),
          actorName: String(payload.actorName ?? "").trim() || "-",
        },
      };
    }

    if (item.eventType === "nghuy_qc_duyet") {
      return {
        kind: "key",
        key: `events.${item.eventType}`,
        values: {
          requestCode: String(payload.requestCode ?? "").trim() || "-",
          approverName: String(payload.approverName ?? "").trim() || "-",
        },
      };
    }

    if (item.eventType === "nghuy_gd_duyet") {
      return {
        kind: "key",
        key: `events.${item.eventType}`,
        values: {
          requestCode: String(payload.requestCode ?? "").trim() || "-",
          totalQtyPcs: displayNumber(payload.totalQtyPcs),
          receiptCode: String(payload.receiptCode ?? "").trim() || "-",
          approverName: String(payload.approverName ?? "").trim() || "-",
        },
      };
    }

    if (CORROSION_TEST_EVENT_KEYS.has(item.eventType)) {
      const code = String(payload.iqcCode ?? "").trim() || "-";
      const material = String(payload.materialCode ?? "").trim() || "-";
      const editor = String(payload.editorName ?? "").trim() || "-";
      const reason = String(payload.reason ?? "").trim();
      if (item.eventType === "corrosion_test_edit_proposed") {
        return {
          kind: "key",
          key: "events.corrosion_test_edit_proposed",
          values: { editor, code },
        };
      }
      if (item.eventType === "corrosion_test_edit_decided") {
        if (payload.superseded === true) {
          return {
            kind: "key",
            key: "events.corrosion_test_edit_superseded",
            values: { code },
          };
        }
        if (payload.approved === true) {
          return {
            kind: "key",
            key: "events.corrosion_test_edit_approved",
            values: { code },
          };
        }
        return {
          kind: "key",
          key: "events.corrosion_test_edit_rejected",
          values: { code, reason },
        };
      }
      if (item.eventType === "corrosion_test_director_created") {
        return {
          kind: "key",
          key: "events.corrosion_test_director_created",
          values: { code, material },
        };
      }
      return {
        kind: "key",
        key: "events.corrosion_test_director_edited",
        values: { code },
      };
    }

    if (OQC_SAMPLE_EVENT_KEYS.has(item.eventType)) {
      const code = String(payload.iqcCode ?? "").trim() || "-";
      const pgm =
        String(payload.receiptNo ?? "").trim() ||
        String(payload.materialCode ?? "").trim() ||
        "-";
      const editor = String(payload.editorName ?? "").trim() || "-";
      const reason = String(payload.reason ?? "").trim();
      if (item.eventType === "oqc_sample_edit_proposed") {
        return {
          kind: "key",
          key: "events.oqc_sample_edit_proposed",
          values: { editor, code },
        };
      }
      if (item.eventType === "oqc_sample_edit_decided") {
        if (payload.superseded === true) {
          return {
            kind: "key",
            key: "events.oqc_sample_edit_superseded",
            values: { code },
          };
        }
        if (payload.approved === true) {
          return {
            kind: "key",
            key: "events.oqc_sample_edit_approved",
            values: { code },
          };
        }
        return {
          kind: "key",
          key: "events.oqc_sample_edit_rejected",
          values: { code, reason },
        };
      }
      if (item.eventType === "oqc_sample_director_created") {
        return {
          kind: "key",
          key: "events.oqc_sample_director_created",
          values: { code, pgm },
        };
      }
      return {
        kind: "key",
        key: "events.oqc_sample_director_edited",
        values: { code },
      };
    }

    if (
      OQC_FP_EVENT_KEYS.has(item.eventType) ||
      OQC_XLBM_EVENT_KEYS.has(item.eventType)
    ) {
      const family = item.eventType.startsWith("oqc_xlbm")
        ? "oqc_xlbm"
        : "oqc_fp";
      const code = String(payload.iqcCode ?? "").trim() || "-";
      const material = String(payload.materialCode ?? "").trim() || "-";
      const deliveryNo = String(payload.deliveryNo ?? "").trim() || "-";
      const editor = String(payload.editorName ?? "").trim() || "-";
      const reason = String(payload.reason ?? "").trim();
      if (item.eventType === `${family}_edit_proposed`) {
        return {
          kind: "key",
          key: `events.${family}_edit_proposed`,
          values: { editor, code },
        };
      }
      if (item.eventType === `${family}_edit_decided`) {
        if (payload.superseded === true) {
          return {
            kind: "key",
            key: `events.${family}_edit_superseded`,
            values: { code },
          };
        }
        if (payload.approved === true) {
          return {
            kind: "key",
            key: `events.${family}_edit_approved`,
            values: { code },
          };
        }
        return {
          kind: "key",
          key: `events.${family}_edit_rejected`,
          values: { code, reason },
        };
      }
      if (item.eventType === `${family}_director_created`) {
        return {
          kind: "key",
          key: `events.${family}_director_created`,
          values: { code, material, deliveryNo },
        };
      }
      return {
        kind: "key",
        key: `events.${family}_director_edited`,
        values: { code },
      };
    }

    if (OTHER_MATERIAL_RECEIPT_APPROVAL_EVENT_KEYS.has(item.eventType)) {
      return {
        kind: "key",
        key: `events.${item.eventType}`,
        values: {
          actorName: String(payload.actorName ?? "").trim() || "-",
          receiptNo: String(payload.receiptNo ?? "").trim() || "-",
          count: displayNumber(payload.pendingCount),
        },
      };
    }

    if (FP_QC_STANDARD_EVENT_KEYS.has(item.eventType)) {
      const code = String(payload.standardCode ?? "").trim() || "-";
      const product = String(payload.productCode ?? "").trim() || "-";
      return {
        kind: "key",
        key: "events.fp_qc_standard_approved",
        values: { code, product },
      };
    }

    if (EQUIPMENT_CALIBRATION_EVENT_KEYS.has(item.eventType)) {
      const code = String(payload.calibrationCode ?? "").trim() || "-";
      const equipment =
        [payload.equipmentCode, payload.equipmentName]
          .map((part) => String(part ?? "").trim())
          .filter(Boolean)
          .join(" ー ") || "-";
      if (item.eventType === "equipment_calibration_failed") {
        return {
          kind: "key",
          key: "events.equipment_calibration_failed",
          values: { code, equipment },
        };
      }
      const rawNextDate = String(payload.nextCalibrationDate ?? "").trim();
      const nextDate = rawNextDate ? formatIsoDate(rawNextDate) : "-";
      if (item.eventType === "equipment_calibration_due_soon") {
        return {
          kind: "key",
          key: "events.equipment_calibration_due_soon",
          values: {
            equipment,
            nextDate,
            days: String(payload.daysRemaining ?? "").trim() || "-",
          },
        };
      }
      return {
        kind: "key",
        key: "events.equipment_calibration_overdue",
        values: { equipment, nextDate },
      };
    }

    if (CAPA_EVENT_KEYS.has(item.eventType)) {
      return {
        kind: "key",
        key: eventMessageKey(item.eventType),
        values: {
          code: field(payload.code),
          role: field(payload.role),
          reason: field(payload.reason),
          capaStatus: field(payload.capaStatus),
          kind: payload.kind === "claim" ? "claim" : "internal",
          customerName: field(payload.customerName),
          defectType: field(payload.defectType),
          productCode: field(payload.productCode),
          productName: field(payload.productName),
          deadline: payload.deadline
            ? formatIsoDate(String(payload.deadline))
            : "-",
          hasDeadline: payload.deadline ? "yes" : "no",
        },
      };
    }

    if (TEST_REQUEST_EVENT_KEYS.has(item.eventType)) {
      return {
        kind: "key",
        key: eventMessageKey(item.eventType),
        values: {
          code: field(payload.testRequestCode),
          requestDepartment: field(payload.requestDepartment),
          handlerDepartment: field(payload.handlerDepartment),
          classification: field(payload.classification),
          status: field(payload.status),
          result: field(payload.result),
          reason: field(payload.reason),
        },
      };
    }

    const sfgCode = String(payload.sfgCode ?? "").trim();
    const productName = String(payload.productName ?? "").trim();
    if (sfgCode || productName) {
      return {
        kind: "key",
        key: `events.${item.eventType}`,
        values: { sfgCode: sfgCode || "-", productName: productName || "-" },
      };
    }
  }

  const stored = item.message?.trim();
  if (stored) return { kind: "text", text: stored };

  return { kind: "key", key: "fallbackMessage", values: {} };
}

/** R6.3 — an unread marker shows only while the record is unread and still open. */
export function isNotificationUnread(item: NotificationItem): boolean {
  return !item.isRead && item.status !== NOTIFICATION_RESOLVED_STATUS;
}

/** R6.4 — read state of one record changes for this caller only. */
export function markNotificationRead(
  items: NotificationItem[],
  id: number,
): NotificationItem[] {
  return items.map((item) =>
    item.id === id ? { ...item, isRead: true } : item,
  );
}

/** R6.5 — every listed record becomes read for this caller. */
export function markAllNotificationsRead(
  items: NotificationItem[],
): NotificationItem[] {
  return items.map((item) => (item.isRead ? item : { ...item, isRead: true }));
}

/** R6.3 — every page loaded so far, flattened into one newest-first list. */
export function flattenNotificationPages(
  pages: InfiniteData<NotificationListPage> | undefined,
): NotificationItem[] {
  return pages?.pages.flatMap((page) => page.data) ?? [];
}

export function useNotificationList(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: notificationQueryKeys.list,
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<NotificationListPage>(
        notificationApiRoutes.list,
        {
          params: {
            limit: NOTIFICATION_PAGE_SIZE,
            ...(pageParam === null ? {} : { cursor: pageParam }),
          },
        },
      );
      return data;
    },
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled,
  });
}

export function useNotificationUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: notificationQueryKeys.unreadCount,
    queryFn: async () => {
      const { data } = await api.get<{ count: number }>(
        notificationApiRoutes.unreadCount,
      );
      return data.count;
    },
    enabled,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.patch(notificationApiRoutes.markRead(id));
      return id;
    },
    onSuccess: (id) => {
      qc.setQueryData<InfiniteData<NotificationListPage>>(
        notificationQueryKeys.list,
        (cached) =>
          cached
            ? {
                ...cached,
                pages: cached.pages.map((page) => ({
                  ...page,
                  data: markNotificationRead(page.data, id),
                })),
              }
            : cached,
      );
      void qc.invalidateQueries({ queryKey: notificationQueryKeys.all });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.patch(notificationApiRoutes.markAllRead);
    },
    onSuccess: () => {
      qc.setQueryData<InfiniteData<NotificationListPage>>(
        notificationQueryKeys.list,
        (cached) =>
          cached
            ? {
                ...cached,
                pages: cached.pages.map((page) => ({
                  ...page,
                  data: markAllNotificationsRead(page.data),
                })),
              }
            : cached,
      );
      void qc.invalidateQueries({ queryKey: notificationQueryKeys.all });
    },
  });
}
