import { describe, expect, it, vi } from "vitest";

import {
  canReadAnyNotification,
  formatUnreadBadge,
  isNotificationUnread,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_EVENT_KEYS,
  NOTIFICATION_REQUIRED_SCOPES,
  notificationApiRoutes,
  resolveNotificationMessage,
  sortNotificationsNewestFirst,
  toNotificationTimeParts,
} from "@/kernel/core/hooks/api/useNotifications";
import enCommon from "@/kernel/langs/en/common.json";
import viCommon from "@/kernel/langs/vi/common.json";

import type { NotificationItem } from "@/kernel/core/hooks/api/useNotifications";

/** Grants as the role seed defines them, so the bell agrees with the read API. */
const ROLE_PERMISSIONS = {
  director: ["*:*"],
  technical_manager: [
    "product:read",
    "product:write:technical",
    "product:notify",
    "purchase_request:read",
  ],
  technical_staff: [
    "product:read",
    "product:write:technical",
    "product:notify",
    "purchase_request:read",
  ],
  purchase_manager: ["purchase_request:read", "purchase_request:write"],
  purchase_staff: ["purchase_request:read", "purchase_request:write"],
  sale_manager: [
    "product:read",
    "product:write:general",
    "product:delete",
    "product:price:read",
    "product:price:write",
    "product:price:delete",
    "purchase_request:read",
  ],
  warehouse_keeper: ["product:read", "purchase_request:read"],
} as const;

const NOW = new Date("2026-08-18T10:00:00Z");

function notification(
  overrides: Partial<NotificationItem> & Pick<NotificationItem, "id">,
): NotificationItem {
  return {
    eventType: "sp_can_bo_sung_ky_thuat",
    message: null,
    link: "/master-data/product/1",
    payload: { sfgCode: "FG_0001", productName: "Bulong M6" },
    status: "open",
    createdAt: "2026-08-18T09:00:00Z",
    isRead: false,
    ...overrides,
  };
}

describe("notification bell surface", () => {
  describe("unread badge (R6.1)", () => {
    it("renders no badge at a count of zero", () => {
      expect(formatUnreadBadge(0)).toBeNull();
      expect(formatUnreadBadge(-1)).toBeNull();
      expect(formatUnreadBadge(Number.NaN)).toBeNull();
    });

    it("renders the caller's count while it is positive", () => {
      expect(formatUnreadBadge(1)).toBe("1");
      expect(formatUnreadBadge(42)).toBe("42");
      expect(formatUnreadBadge(99)).toBe("99");
    });

    it("collapses an oversized count into the overflow marker", () => {
      expect(formatUnreadBadge(100)).toBe("99+");
    });
  });

  describe("bell visibility (R6.2)", () => {
    it("shows the bell to the two Kỹ thuật roles that hold the notify scope", () => {
      expect(
        canReadAnyNotification([...ROLE_PERMISSIONS.technical_manager]),
      ).toBe(true);
      expect(
        canReadAnyNotification([...ROLE_PERMISSIONS.technical_staff]),
      ).toBe(true);
    });

    it("shows the bell to the director through the wildcard", () => {
      expect(canReadAnyNotification([...ROLE_PERMISSIONS.director])).toBe(true);
    });

    it("shows the bell to the purchasing team, which never holds the product scope", () => {
      expect(
        canReadAnyNotification([...ROLE_PERMISSIONS.purchase_manager]),
      ).toBe(true);
      expect(canReadAnyNotification([...ROLE_PERMISSIONS.purchase_staff])).toBe(
        true,
      );
    });

    it("shows the bell to a requesting department that receives PR events", () => {
      expect(
        canReadAnyNotification([...ROLE_PERMISSIONS.warehouse_keeper]),
      ).toBe(true);
      expect(canReadAnyNotification([...ROLE_PERMISSIONS.sale_manager])).toBe(
        true,
      );
    });

    it("hides the bell from an actor holding no notification scope", () => {
      expect(canReadAnyNotification(["product:read"])).toBe(false);
      expect(canReadAnyNotification([])).toBe(false);
    });

    it("gates on the scopes the emitted events actually require", () => {
      expect([...NOTIFICATION_REQUIRED_SCOPES]).toEqual([
        "product:notify",
        "purchase_request:read",
        // Each work-order book stamps its records with its own read scope; planning and the
        // mechanical shop hold it without holding either of the other two, so leaving it out
        // hid their whole inbox behind a bell that never rendered.
        "work_order_master:read",
        "work_order_sub:read",
        "work_order_wire_drawing:read",
        // VTTM's 3 actor-driven triggers + the fully-delivered reminder are stamped with
        // this one; Sales holds it without necessarily holding any of the scopes above.
        "commercial_material_revenue:read",
        "sample_delivery_note:read",
        "sample_order:read",
        "service_delivery_note:read",
        "commercial_goods_delivery_note:read",
        "mrp:read",
        "rfq:read",
        "delivery_plan_domestic:read",
        "delivery_plan_export:read",
        "iqc_raw_material:read",
        "iqc_commercial_goods:read",
        "iqc_tool_equipment:read",
        "iqc_other_material:read",
        "iqc_xlbm_material:read",
        "oqc_finished_product:read",
        "oqc_xlbm_material:read",
        // Equipment calibration reminders are stamped with this one; the
        // equipment-owning departments hold it without holding any scope above.
        "equipment_calibration:read",
        // Test-lab, service SO and maintenance records carry their own scope each.
        "capa:read",
        "capa_claim:read",
        "test_lab:read",
        "service_revenue:read",
        "maintenance_registration:read",
        // The BTP OK receipt's
        // pending-QC notice is stamped with the semi-finished receipt scope.
        "semi_finished_receipt_ok:read",
        "request:read",
      ]);
    });
  });

  describe("panel rows (R6.3)", () => {
    const items = [
      notification({ id: 1, createdAt: "2026-08-18T08:00:00Z" }),
      notification({ id: 2, createdAt: "2026-08-18T09:30:00Z" }),
      notification({ id: 3, createdAt: "2026-08-17T09:30:00Z" }),
    ];

    it("orders rows by creation time descending", () => {
      expect(
        sortNotificationsNewestFirst(items).map((item) => item.id),
      ).toEqual([2, 1, 3]);
    });

    it("breaks a timestamp tie on the newer id", () => {
      const tied = [
        notification({ id: 5, createdAt: "2026-08-18T09:00:00Z" }),
        notification({ id: 9, createdAt: "2026-08-18T09:00:00Z" }),
      ];
      expect(sortNotificationsNewestFirst(tied).map((item) => item.id)).toEqual(
        [9, 5],
      );
    });

    it("does not mutate the source list", () => {
      sortNotificationsNewestFirst(items);
      expect(items.map((item) => item.id)).toEqual([1, 2, 3]);
    });

    it("marks a row unread only while it is neither read nor closed", () => {
      expect(isNotificationUnread(notification({ id: 1 }))).toBe(true);
      expect(isNotificationUnread(notification({ id: 1, isRead: true }))).toBe(
        false,
      );
      expect(
        isNotificationUnread(notification({ id: 1, status: "resolved" })),
      ).toBe(false);
    });

    it("renders relative time in the unit the elapsed span calls for", () => {
      expect(toNotificationTimeParts("2026-08-18T09:59:30Z", NOW)).toEqual({
        unit: "justNow",
        count: 0,
      });
      expect(toNotificationTimeParts("2026-08-18T09:45:00Z", NOW)).toEqual({
        unit: "minutesAgo",
        count: 15,
      });
      expect(toNotificationTimeParts("2026-08-18T07:00:00Z", NOW)).toEqual({
        unit: "hoursAgo",
        count: 3,
      });
      expect(toNotificationTimeParts("2026-08-16T10:00:00Z", NOW)).toEqual({
        unit: "daysAgo",
        count: 2,
      });
    });
  });

  describe("row activation (R6.4)", () => {
    it("addresses the per-record read route of the activated row", () => {
      expect(notificationApiRoutes.markRead(7)).toBe("/notifications/7/read");
    });

    it("marks only the activated row read for this caller", () => {
      const items = [notification({ id: 1 }), notification({ id: 2 })];
      expect(markNotificationRead(items, 2)).toEqual([
        expect.objectContaining({ id: 1, isRead: false }),
        expect.objectContaining({ id: 2, isRead: true }),
      ]);
    });

    it("carries the link the notification names", () => {
      expect(notification({ id: 1 }).link).toBe("/master-data/product/1");
    });
  });

  describe("mark all read (R6.5)", () => {
    it("addresses the caller-scoped mark-all route", () => {
      expect(notificationApiRoutes.markAllRead).toBe("/notifications/read-all");
    });

    it("clears the unread state of every listed row", () => {
      const items = [
        notification({ id: 1 }),
        notification({ id: 2, isRead: true }),
        notification({ id: 3 }),
      ];
      expect(markAllNotificationsRead(items).every((item) => item.isRead)).toBe(
        true,
      );
    });
  });

  describe("row text (R6.3)", () => {
    it("phrases a known event from its payload, since the record stores no text", () => {
      expect(resolveNotificationMessage(notification({ id: 1 }))).toEqual({
        kind: "key",
        key: "events.sp_can_bo_sung_ky_thuat",
        values: { sfgCode: "FG_0001", productName: "Bulong M6" },
      });
    });

    it("substitutes the empty marker for a payload field the emitter omitted", () => {
      const partial = notification({ id: 1, payload: { sfgCode: "FG_0002" } });
      expect(resolveNotificationMessage(partial)).toEqual({
        kind: "key",
        key: "events.sp_can_bo_sung_ky_thuat",
        values: { sfgCode: "FG_0002", productName: "-" },
      });
    });

    it.each([
      [0, "events.tooling_order_bi_huy_hang_loat"],
      [3, "events.tooling_order_bi_huy_hang_loat_more"],
    ])(
      "phrases a tooling order batch with %i left out of the preview",
      (overflow, key) => {
        const batch = notification({
          id: 1,
          eventType: "tooling_order_bi_huy_hang_loat",
          payload: {
            count: 2 + overflow,
            toolingCodes: ["T-2026-0001", "T-2026-0002"],
            overflow,
          },
        });
        expect(resolveNotificationMessage(batch)).toMatchObject({
          kind: "key",
          key,
          values: {
            toolingCodes: "T-2026-0001, T-2026-0002",
            overflow: String(overflow),
          },
        });
      },
    );

    it("phrases a purchase-order event from its own payload fields", () => {
      const cancelled = notification({
        id: 1,
        eventType: "po_bi_huy",
        payload: {
          poNo: "HP-NVL-2026-0001",
          cancelReason: "NCC không giao được",
        },
      });
      expect(resolveNotificationMessage(cancelled)).toEqual({
        kind: "key",
        key: "events.po_bi_huy",
        values: {
          poNo: "HP-NVL-2026-0001",
          sourceCode: "-",
          cancelReason: "NCC không giao được",
        },
      });
    });

    it("phrases a VTK receipt awaiting stocktake approval from its payload", () => {
      const awaiting = notification({
        id: 1,
        eventType: "other_material_receipt_ng_awaiting_approval",
        link: "/warehouse/other-material/ng/4",
        payload: {
          receiptNo: "PNK-NGVTK-2026-0004",
          pendingCount: 2,
          actorName: "Thủ kho A",
        },
      });
      expect(resolveNotificationMessage(awaiting)).toEqual({
        kind: "key",
        key: "events.other_material_receipt_ng_awaiting_approval",
        values: {
          actorName: "Thủ kho A",
          receiptNo: "PNK-NGVTK-2026-0004",
          count: "2",
        },
      });
    });

    it("phrases an MRP event from its own payload fields", () => {
      const awaiting = notification({
        id: 1,
        eventType: "mrp_cho_duyet",
        payload: { mrpId: "MRP-2026-0001", materialName: "Thép SWCH10A" },
      });
      expect(resolveNotificationMessage(awaiting)).toEqual({
        kind: "key",
        key: "events.mrp_cho_duyet",
        values: {
          mrpId: "MRP-2026-0001",
          materialName: "Thép SWCH10A",
          cancelReason: "-",
        },
      });
    });

    it("carries the cancel reason of a cancelled MRP", () => {
      const cancelled = notification({
        id: 1,
        eventType: "mrp_bi_huy",
        payload: { mrpId: "MRP-2026-0001", cancelReason: "Đổi kế hoạch" },
      });
      expect(resolveNotificationMessage(cancelled)).toEqual({
        kind: "key",
        key: "events.mrp_bi_huy",
        values: {
          mrpId: "MRP-2026-0001",
          materialName: "-",
          cancelReason: "Đổi kế hoạch",
        },
      });
    });

    it("phrases an IQC record event and splits the edit decision", () => {
      const created = notification({
        id: 1,
        eventType: "iqc-raw-material.director-created",
        payload: {
          iqcCode: "IQC-NVL-2026-0001",
          materialCode: "VT_0001",
          receiptNo: "PNK-2026-0001",
        },
      });
      expect(resolveNotificationMessage(created)).toMatchObject({
        kind: "key",
        key: "events.iqc-raw-material_director-created",
        values: {
          code: "IQC-NVL-2026-0001",
          materialCode: "VT_0001",
          receiptNo: "PNK-2026-0001",
        },
      });

      const rejected = notification({
        id: 2,
        eventType: "oqc-fp.edit-decided",
        payload: { iqcCode: "OQC-TP-2026-0001", approved: false },
      });
      expect(resolveNotificationMessage(rejected)).toMatchObject({
        key: "events.oqc-fp_edit-rejected",
        values: { code: "OQC-TP-2026-0001" },
      });

      const approved = notification({
        id: 3,
        eventType: "iqc-xlbm.edit-decided",
        payload: { iqcCode: "IQC-XLBM-2026-0001", approved: true },
      });
      expect(resolveNotificationMessage(approved)).toMatchObject({
        key: "events.iqc-xlbm_edit-approved",
      });
    });

    it("phrases the RFQ technical-input and overdue events", () => {
      const overdue = notification({
        id: 1,
        eventType: "rfq_tre_han_bao_gia",
        payload: {
          rfqCode: "RFQ-2026-0001",
          companyName: "Công ty A",
          quoteDueDate: "2026-09-28",
        },
      });
      expect(resolveNotificationMessage(overdue)).toEqual({
        kind: "key",
        key: "events.rfq_tre_han_bao_gia",
        values: {
          rfqCode: "RFQ-2026-0001",
          companyName: "Công ty A",
          quoteDueDate: "28/09/2026",
        },
      });
    });

    it("phrases the XLBM Outgoing QC decision by its outcome", () => {
      const line = {
        issueNo: "PXK-XLBM-0001",
        lotNo: "LOT-1",
        materialName: "Hoá chất A",
        quantity: "12.5000",
        unit: "kg",
      };
      const held = notification({
        id: 1,
        eventType: "xlbm_issue_ok_qc_decided",
        payload: { ...line, verdict: "held", shortOfStock: false },
      });
      const short = notification({
        id: 2,
        eventType: "xlbm_issue_ok_qc_decided",
        payload: { ...line, verdict: "released", shortOfStock: true },
      });
      const issued = notification({
        id: 3,
        eventType: "xlbm_issue_ok_qc_decided",
        payload: { ...line, verdict: "released", shortOfStock: false },
      });

      expect(resolveNotificationMessage(held)).toMatchObject({
        key: "events.xlbm_issue_ok_qc_held",
      });
      expect(resolveNotificationMessage(short)).toMatchObject({
        key: "events.xlbm_issue_ok_qc_released_short",
      });
      expect(resolveNotificationMessage(issued)).toMatchObject({
        key: "events.xlbm_issue_ok_qc_decided",
        values: { quantity: "12,5", unit: "kg", lotNo: "LOT-1" },
      });
    });

    it("names the CCDC sub-warehouse an issue was raised from", () => {
      const returned = notification({
        id: 1,
        eventType: "tool_equipment_issue_return_to_supplier",
        payload: {
          issueNo: "PXK-CCDC-0001",
          warehouse: "ngUsed",
          toolName: "Mũi khoan",
          quantity: "3",
          unit: "cái",
          poNo: "POMH-0001",
          remainingBalance: 2,
        },
      });
      expect(resolveNotificationMessage(returned)).toEqual({
        kind: "key",
        key: "events.tool_equipment_issue_return_to_supplier_ngUsed",
        values: {
          issueNo: "PXK-CCDC-0001",
          toolName: "Mũi khoan",
          quantity: "3",
          unit: "cái",
          reference: "POMH-0001",
          remainingBalance: "2",
          orderKind: "",
        },
      });
    });

    it("prints quantities in the system number format", () => {
      const subcontract = notification({
        id: 1,
        eventType: "xlbm_issue_ok_subcontract",
        payload: { issueNo: "PXK-XLBM-0002", quantity: "1234567.1250" },
      });
      expect(resolveNotificationMessage(subcontract)).toMatchObject({
        values: { quantity: "1.234.567,125" },
      });
    });

    it("prints percents, weights and totals in the system number format", () => {
      const sorting = notification({
        id: 1,
        eventType: "sorting_moi",
        payload: {
          orderCode: "SO-0001",
          ngPercent: 12.5,
          thresholdPercent: 10,
        },
      });
      const cancelled = notification({
        id: 2,
        eventType: "ldd_bi_huy_co_ct",
        payload: { subCode: "LSX-0001", materialIssuedKg: "1250.500" },
      });
      const scrap = notification({
        id: 3,
        eventType: "nghuy_gd_duyet",
        payload: { requestCode: "NGH-0001", totalQtyPcs: 12000 },
      });
      expect(resolveNotificationMessage(sorting)).toMatchObject({
        values: { ngPercent: "12,5", thresholdPercent: "10" },
      });
      expect(resolveNotificationMessage(cancelled)).toMatchObject({
        values: { materialIssuedKg: "1.250,5" },
      });
      expect(resolveNotificationMessage(scrap)).toMatchObject({
        values: { totalQtyPcs: "12.000" },
      });
    });

    it("falls back to the CCDC reference when the order number is empty", () => {
      const subcontract = notification({
        id: 1,
        eventType: "tool_equipment_issue_subcontract",
        payload: {
          issueNo: "PXK-CCDC-0002",
          quantity: "1",
          poNo: "",
          reference: "GC-0001",
        },
      });
      expect(resolveNotificationMessage(subcontract)).toMatchObject({
        values: { reference: "GC-0001" },
      });
    });

    it("phrases a delivery-plan reschedule by what changed", () => {
      const plan = {
        planCode: "KHGH-2026-W40-001",
        customerName: "Công ty B",
        previousEtd: "2026-10-01",
        nextEtd: "2026-10-05",
      };
      const etdOnly = notification({
        id: 1,
        eventType: "delivery_plan.schedule_changed",
        payload: { ...plan, etdChanged: true, changedQuantityLines: 0 },
      });
      const quantityOnly = notification({
        id: 2,
        eventType: "delivery_plan.schedule_changed",
        payload: { ...plan, etdChanged: false, changedQuantityLines: 2 },
      });
      const both = notification({
        id: 3,
        eventType: "delivery_plan.schedule_changed",
        payload: { ...plan, etdChanged: true, changedQuantityLines: 2 },
      });

      expect(resolveNotificationMessage(etdOnly)).toMatchObject({
        key: "events.delivery_plan_etd_changed",
        values: { previousEtd: "01/10/2026", nextEtd: "05/10/2026" },
      });
      expect(resolveNotificationMessage(quantityOnly)).toMatchObject({
        key: "events.delivery_plan_quantity_changed",
      });
      expect(resolveNotificationMessage(both)).toMatchObject({
        key: "events.delivery_plan_schedule_changed",
      });
    });

    it("phrases a subcontract-order event from its own payload fields", () => {
      const reopened = notification({
        id: 1,
        eventType: "pogc_mo_lai",
        payload: { subcontractOrderId: "GC-NVL-2026-0001" },
      });
      expect(resolveNotificationMessage(reopened)).toEqual({
        kind: "key",
        key: "events.pogc_mo_lai",
        values: { subcontractOrderId: "GC-NVL-2026-0001", cancelReason: "-" },
      });
    });

    it("phrases Lab analysis-data events from their own payload fields", () => {
      expect(
        resolveNotificationMessage(
          notification({
            id: 1,
            eventType: "rnd_da_huy",
            payload: {
              rndProjectId: 3,
              rndProjectCode: "RD-2026-0001",
              projectName: "Line improvement",
              actorName: "QC Staff",
              reason: "Out of scope",
            },
          }),
        ),
      ).toEqual({
        kind: "key",
        key: "events.rnd_da_huy",
        values: {
          code: "RD-2026-0001",
          projectName: "Line improvement",
          actorName: "QC Staff",
          lineSx: "-",
          reason: "Out of scope",
        },
      });

      expect(
        resolveNotificationMessage(
          notification({
            id: 2,
            eventType: "kke_inventory_pending_approval",
            payload: {
              id: 5,
              code: "KKVT-2026-0001",
              lineSx: "acidSpin",
              reason: "Recount",
              editorName: "QC Staff",
            },
          }),
        ),
      ).toEqual({
        kind: "key",
        key: "events.kke_inventory_pending_approval",
        values: {
          code: "KKVT-2026-0001",
          projectName: "-",
          actorName: "QC Staff",
          lineSx: "acidSpin",
          reason: "Recount",
        },
      });

      expect(
        resolveNotificationMessage(
          notification({
            id: 3,
            eventType: "kke_inventory_approved",
            payload: { id: 5, code: "KKVT-2026-0001", editorId: 11 },
          }),
        ),
      ).toEqual({
        kind: "key",
        key: "events.kke_inventory_approved",
        values: {
          code: "KKVT-2026-0001",
          projectName: "-",
          actorName: "-",
          lineSx: "-",
          reason: "-",
        },
      });
    });

    it("phrases a sales-order balance-adjustment event from its own payload fields", () => {
      const adjusted = notification({
        id: 1,
        eventType: "so_dieu_chinh_balance",
        payload: {
          orderCode: "PO_ND_2026_0001",
          customerProductCode: "SAM-M6-20",
          previousValue: 3000,
          value: 2500,
          actorName: "Nguyễn Văn A",
        },
      });
      expect(resolveNotificationMessage(adjusted)).toEqual({
        kind: "key",
        key: "events.so_dieu_chinh_balance",
        values: {
          orderCode: "PO_ND_2026_0001",
          customerProductCode: "SAM-M6-20",
          previousValue: "3000",
          value: "2500",
          cancelReason: "-",
          actorName: "Nguyễn Văn A",
          customerName: "-",
        },
      });
    });

    it("phrases a sales-order cancellation event, filling absent fields with the empty marker", () => {
      const cancelled = notification({
        id: 1,
        eventType: "so_bi_huy",
        payload: {
          orderCode: "PO_ND_2026_0002",
          cancelReason: "Khách huỷ đơn",
          actorName: "Nguyễn Văn A",
          customerName: "ABC Co",
        },
      });
      expect(resolveNotificationMessage(cancelled)).toEqual({
        kind: "key",
        key: "events.so_bi_huy",
        values: {
          orderCode: "PO_ND_2026_0002",
          customerProductCode: "-",
          previousValue: "-",
          value: "-",
          cancelReason: "Khách huỷ đơn",
          actorName: "Nguyễn Văn A",
          customerName: "ABC Co",
        },
      });
    });

    it("picks the domestic-vs-export template for the sales-order creation event (Requirement 10 AC1)", () => {
      const createdDomestic = notification({
        id: 1,
        eventType: "so_da_tao",
        payload: { orderCode: "PO_ND_2026_0003", orderType: "domestic" },
      });
      expect(resolveNotificationMessage(createdDomestic)).toEqual(
        expect.objectContaining({ key: "events.so_da_tao_domestic" }),
      );

      const createdExport = notification({
        id: 2,
        eventType: "so_da_tao",
        payload: { orderCode: "PO_XK_2026_0001", orderType: "export" },
      });
      expect(resolveNotificationMessage(createdExport)).toEqual(
        expect.objectContaining({ key: "events.so_da_tao_export" }),
      );
    });

    it("falls back to denormalised text for an event type it does not know", () => {
      const unknown = notification({
        id: 1,
        eventType: "other_event",
        message: "Có việc mới",
        payload: {},
      });
      expect(resolveNotificationMessage(unknown)).toEqual({
        kind: "text",
        text: "Có việc mới",
      });
    });

    it("never renders an empty row when neither payload nor text is usable", () => {
      const bare = notification({
        id: 1,
        eventType: "other_event",
        message: null,
        payload: {},
      });
      expect(resolveNotificationMessage(bare)).toEqual({
        kind: "key",
        key: "fallbackMessage",
        values: {},
      });
    });

    it("counts the days to an urgent need date stored as a full timestamp", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-08T03:00:00.000Z"));
      const urgent = notification({
        id: 1,
        eventType: "purchaseRequestUrgent",
        payload: {
          prId: "PR-DG-2026-0001",
          department: "packaging",
          earliestNeedDate: "2026-09-10T00:00:00.000Z",
        },
      });

      expect(resolveNotificationMessage(urgent)).toEqual({
        kind: "key",
        key: "events.purchaseRequestUrgent",
        values: {
          prId: "PR-DG-2026-0001",
          department: "packaging",
          days: "2",
        },
      });
      vi.useRealTimers();
    });

    it("marks the day count empty rather than NaN when the date is unreadable", () => {
      const broken = notification({
        id: 1,
        eventType: "purchaseRequestUrgent",
        payload: {
          prId: "PR-DG-2026-0001",
          department: "packaging",
          earliestNeedDate: "khong-phai-ngay",
        },
      });

      expect(resolveNotificationMessage(broken)).toEqual({
        kind: "key",
        key: "events.purchaseRequestUrgent",
        values: {
          prId: "PR-DG-2026-0001",
          department: "packaging",
          days: "-",
        },
      });
    });

    it("phrases the four sample-delivery-note events (sales-phieu-giao-mau-v01.md Requirement 9)", () => {
      const created = notification({
        id: 10,
        eventType: "sample_delivery_note.created",
        payload: {
          noteId: 9,
          noteCode: "PGM-2026-0009",
          customerName: "LG Electronics Vietnam",
        },
      });
      expect(resolveNotificationMessage(created)).toEqual({
        kind: "key",
        key: "events.sample_delivery_note_created",
        values: {
          noteCode: "PGM-2026-0009",
          customerName: "LG Electronics Vietnam",
        },
      });
      expect(viCommon.notification.events.sample_delivery_note_created).toBe(
        "Phiếu giao mẫu {noteCode} ({customerName}) cần kiểm mẫu trước khi giao.",
      );

      const ready = notification({
        id: 11,
        eventType: "sample_delivery_note.ready_to_deliver",
        payload: {
          noteId: 9,
          noteCode: "PGM-2026-0009",
          customerName: "LG Electronics Vietnam",
        },
      });
      expect(resolveNotificationMessage(ready)).toEqual({
        kind: "key",
        key: "events.sample_delivery_note_ready_to_deliver",
        values: {
          noteCode: "PGM-2026-0009",
          customerName: "LG Electronics Vietnam",
        },
      });
      expect(
        viCommon.notification.events.sample_delivery_note_ready_to_deliver,
      ).toBe(
        "Phiếu giao mẫu {noteCode} ({customerName}) đã Đạt kiểm mẫu — sẵn sàng giao khách hàng.",
      );

      const ng = notification({
        id: 12,
        eventType: "sample_delivery_note.ng_pending",
        payload: {
          noteId: 9,
          noteCode: "PGM-2026-0009",
          customerName: "LG Electronics Vietnam",
        },
      });
      expect(resolveNotificationMessage(ng)).toEqual({
        kind: "key",
        key: "events.sample_delivery_note_ng_pending",
        values: {
          noteCode: "PGM-2026-0009",
          customerName: "LG Electronics Vietnam",
        },
      });
      expect(viCommon.notification.events.sample_delivery_note_ng_pending).toBe(
        "Phiếu giao mẫu {noteCode} ({customerName}) Không đạt kiểm mẫu — cần xử lý lại.",
      );
    });

    it("splits the delivered event by payload shape: whole-note Sales notice vs. per-tooling-order-line notice", () => {
      const wholeNote = notification({
        id: 13,
        eventType: "sample_delivery_note.delivered",
        payload: {
          noteId: 9,
          noteCode: "PGM-2026-0009",
          customerName: "LG Electronics Vietnam",
        },
      });
      expect(resolveNotificationMessage(wholeNote)).toEqual({
        kind: "key",
        key: "events.sample_delivery_note_delivered",
        values: {
          noteCode: "PGM-2026-0009",
          customerName: "LG Electronics Vietnam",
        },
      });

      const toolingOrderLine = notification({
        id: 14,
        eventType: "sample_delivery_note.delivered",
        payload: {
          noteId: 9,
          noteCode: "PGM-2026-0009",
          toolingOrderId: 3,
          toolingOrderCode: "T-2026-0003",
          productName: "Polycarbonate cover mould",
        },
      });
      expect(resolveNotificationMessage(toolingOrderLine)).toEqual({
        kind: "key",
        key: "events.sample_delivery_note_delivered_tooling_order",
        values: {
          toolingOrderCode: "T-2026-0003",
          productName: "Polycarbonate cover mould",
          noteCode: "PGM-2026-0009",
        },
      });
      expect(
        viCommon.notification.events
          .sample_delivery_note_delivered_tooling_order,
      ).toBe(
        "Tooling Order {toolingOrderCode} — {productName} đã giao thành công cho khách hàng (Phiếu giao mẫu {noteCode}).",
      );
    });

    it("carries a bundle entry for every event type the client claims to know", () => {
      const viEvents: Record<string, string> = viCommon.notification.events;
      const enEvents: Record<string, string> = enCommon.notification.events;
      for (const eventType of NOTIFICATION_EVENT_KEYS) {
        // `next-intl` cannot use a dotted event-bus name as a literal bundle key (see
        // `sampleDeliveryNoteMessageKey`), so the sample-delivery-note keys are stored
        // underscore-joined; the equivalent content assertions live in the two tests above.
        const bundleKey = eventType.replace(/\./g, "_");
        expect(viEvents[bundleKey]).toBeTruthy();
        expect(enEvents[bundleKey]).toBeTruthy();
      }
    });
  });

  describe("empty state (R6.6)", () => {
    it("has an empty message rather than an empty container", () => {
      expect(viCommon.notification.empty).toBeTruthy();
      expect(enCommon.notification.empty).toBeTruthy();
    });
  });

  describe("message bundle", () => {
    it("carries the same notification key set in both locales", () => {
      expect(Object.keys(viCommon.notification).sort()).toEqual(
        Object.keys(enCommon.notification).sort(),
      );
    });

    it("keeps the approved Vietnamese wording for the mark-all control (R6.5)", () => {
      expect(viCommon.notification.markAllRead).toBe("Đánh dấu tất cả đã đọc");
    });
  });
});
