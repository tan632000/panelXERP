import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_EVENT_KEYS,
  NOTIFICATION_REQUIRED_SCOPES,
  resolveNotificationMessage,
} from "@/kernel/core/hooks/api/useNotifications";
import enCommon from "@/kernel/langs/en/common.json";
import viCommon from "@/kernel/langs/vi/common.json";

import type { NotificationItem } from "@/kernel/core/hooks/api/useNotifications";

const tVi = createTranslator({
  locale: "vi",
  messages: { common: viCommon },
  namespace: "common.notification",
});
const tEn = createTranslator({
  locale: "en",
  messages: { common: enCommon },
  namespace: "common.notification",
});

type Translate = typeof tVi;

/** Headline plus any digest rows, joined by newlines. */
function render(
  eventType: string,
  payload: Record<string, unknown>,
  t: Translate = tVi,
): string {
  const item: Pick<NotificationItem, "eventType" | "message" | "payload"> = {
    eventType,
    message: null,
    payload,
  };
  const message = resolveNotificationMessage(item);
  if (message.kind === "text") return message.text;
  const headline = t(message.key as Parameters<Translate>[0], message.values);
  const lines = (message.lines ?? []).map((line) =>
    t(line.key as Parameters<Translate>[0], line.values),
  );
  return [headline, ...lines].join("\n");
}

describe("notification wording from the specs", () => {
  it("phrases the Master due-today and overdue digests", () => {
    const entry = {
      masterNo: "LSX-0001",
      productCode: "SP-01",
      productName: "Bulong",
      qtyPcs: 186000,
      receivedQtyPcs: 93000,
      progressPercent: 50,
      overdueDays: 3,
    };
    expect(render("lsx_den_han", { count: 1, items: [entry] })).toBe(
      "Hôm nay là hạn hoàn thành của mã SP-01 — Bulong (Lệnh Master LSX-0001) nhưng mới đạt 50% (93.000/186.000 pcs).",
    );
    expect(render("lsx_qua_han", { count: 2, items: [entry, entry] })).toBe(
      [
        "Có 2 mã sản phẩm đã quá hạn hoàn thành mà chưa đạt 100% tiến độ:",
        "— SP-01 (Lệnh Master LSX-0001): quá hạn 3 ngày, đạt 50% (93.000/186.000 pcs)",
        "— SP-01 (Lệnh Master LSX-0001): quá hạn 3 ngày, đạt 50% (93.000/186.000 pcs)",
      ].join("\n"),
    );
  });

  it("names the actor and the referencing sub orders on Master notices", () => {
    expect(
      render("lsx_gd_vua_tao", {
        actorName: "Nguyễn Văn A",
        masterNo: "LSX-0001",
        lineCount: 4,
      }),
    ).toBe(
      "Giám đốc Nguyễn Văn A vừa tạo Lệnh Master LSX-0001, gồm 4 mã sản phẩm.",
    );
    expect(
      render("lsx_ma_bi_huy", {
        productCode: "SP-01",
        masterNo: "LSX-0001",
        cancelReason: "Đổi kế hoạch",
        subOrderCount: 7,
        subOrderCodes: ["A1", "A2", "A3", "A4", "A5"],
      }),
    ).toBe(
      "Mã SP-01 trong Lệnh Master LSX-0001 vừa bị huỷ (lý do: Đổi kế hoạch). 7 lệnh sản xuất đang tham chiếu mã này: A1, A2, A3, A4, A5 … và 2 lệnh khác",
    );
  });

  it("translates the raw-material warehouse and drops a missing actor", () => {
    const payload = { receiptNo: "NK-01", warehouse: "ts", pendingCount: 2 };
    expect(
      render("raw_material_receipt_awaiting_approval", {
        ...payload,
        actorName: "Lan",
      }),
    ).toBe(
      "Lan vừa tạo/sửa phiếu nhập kho NK-01 (Kho tái sử dụng) có 2 dòng điều chỉnh kiểm kê chờ duyệt.",
    );
    expect(
      render(
        "raw_material_receipt_awaiting_approval",
        { ...payload, actorName: null },
        tEn,
      ),
    ).toBe(
      "Receipt NK-01 (Reusable Warehouse) has 2 stocktake-adjustment line(s) awaiting approval.",
    );
  });

  it("adds the PO balance to an XLBM return, and omits it when unknown", () => {
    const payload = {
      issueNo: "PXK-1",
      quantity: "10.0000",
      unit: "kg",
      materialName: "Hoá chất",
      lotNo: "L1",
      referenceNo: "PO-9",
    };
    expect(
      render("xlbm_issue_ok_return_supplier", {
        ...payload,
        poBalance: "5.0000",
      }),
    ).toBe(
      "Xuất kho VT XLBM Kho OK PXK-1: trả 10 kg Hoá chất (lô L1) về NCC theo PO PO-9 — PO Balance còn 5.",
    );
    expect(
      render("xlbm_issue_ng_return_supplier", { ...payload, poBalance: null }),
    ).toBe(
      "Xuất kho VT XLBM Kho NG PXK-1: trả 10 kg Hoá chất (lô L1) về NCC theo PO PO-9.",
    );
  });

  it("words a CCDC PO by its kind", () => {
    const payload = {
      issueNo: "PX-1",
      quantity: 2,
      unit: "cái",
      toolName: "Mũi khoan",
      poNo: "PO-1",
      warehouse: "okNew",
    };
    expect(
      render("tool_equipment_issue_subcontract", {
        ...payload,
        orderKind: "subcontractOrder",
      }),
    ).toContain("theo PO gia công PO-1");
    expect(
      render("tool_equipment_issue_subcontract", {
        ...payload,
        orderKind: null,
      }),
    ).toContain("theo PO PO-1");
  });

  it("phrases the XLBM material request and maintenance reminders", () => {
    expect(
      render("xlbm_material_request_overdue", {
        docCode: "YC-1",
        materialCode: "VT-1",
        needDate: "2026-10-09",
      }),
    ).toBe(
      "Yêu cầu xuất kho VT XLBM YC-1 — mã VT VT-1 đã đến/quá ngày cần hàng (09/10/2026) nhưng chưa được xuất kho.",
    );
    expect(
      render("maintenance_activity_overdue", {
        registrationCode: "MA-1",
        subjectText: "Máy dập",
        content: "Thay dầu",
        nextDueOn: "2026-10-01",
        daysOverdue: 8,
      }),
    ).toBe("MA-1 · Máy dập: Thay dầu — quá hạn từ 01/10/2026");
  });

  it("phrases wire-drawing orders and the BTP pending-QC receipt", () => {
    const base = {
      code: "RD-0001",
      materialBefore: "NVL-1",
      materialBeforeName: "Dây thô",
      materialAfter: "NVL-2",
      materialAfterName: "Dây tinh",
      targetWeightKg: "1500.0000",
    };
    expect(render("lenh_rut_day_moi", base)).toBe(
      "Lệnh rút dây RD-0001 vừa được tạo — rút NVL-1 (Dây thô) thành NVL-2 (Dây tinh), kế hoạch 1.500 kg.",
    );
    expect(
      render("lenh_rut_day_bi_huy_co_ct", {
        ...base,
        cancelReason: "Sai mã",
        materialIssuedKg: 1200.5,
        materialReceivedKg: 1100,
        lossKg: 100.5,
      }),
    ).toContain(
      "đã xuất 1.200,5 kg NVL trước rút, đã thu về 1.100 kg NVL sau rút (hao hụt 100,5 kg)",
    );
    expect(
      render("lenh_rut_day_dong_som", {
        ...base,
        materialReceivedKg: 750,
        percent: 50,
      }),
    ).toContain("khi mới thu về 750/1.500 kg (50%)");
    expect(
      render(
        "btp_receipt_pending_qc",
        { actorName: "Lan", receiptNo: "NK-7", pendingCount: 3 },
        tEn,
      ),
    ).toBe(
      "Lan created goods receipt NK-7 with 3 lot(s) awaiting incoming quality inspection.",
    );
  });

  it("phrases IQC edit decisions by proposer, role and supersession", () => {
    const base = { iqcCode: "IQC-1", editorName: "Lan" };
    expect(render("iqc-raw-material.edit-proposed", base)).toBe(
      "Lan vừa đề xuất sửa biên bản IQC IQC-1 — cần bạn duyệt.",
    );
    expect(
      render("iqc-raw-material.edit-decided", {
        ...base,
        approved: false,
        reason: "Sai số",
        decidedByRole: "qc_lab_manager",
      }),
    ).toBe(
      "Đề xuất sửa biên bản IQC IQC-1 của bạn đã bị TP. QC-Lab từ chối. Lý do từ chối: Sai số.",
    );
    expect(
      render("iqc-commercial.edit-decided", {
        ...base,
        approved: false,
        reason: null,
      }),
    ).toBe("Đề xuất sửa biên bản IQC IQC-1 của bạn đã bị Giám đốc từ chối.");
    expect(
      render("iqc-xlbm.edit-decided", {
        ...base,
        approved: false,
        superseded: true,
      }),
    ).toBe(
      "Đề xuất sửa biên bản IQC IQC-1 của bạn không còn áp dụng do Giám đốc đã sửa trực tiếp biên bản này.",
    );
    expect(
      render("iqc-raw-material.edit-level2-pending", {
        ...base,
        levelOneApprovedBy: "Minh",
      }),
    ).toBe(
      "Đề xuất sửa biên bản IQC IQC-1 đã qua duyệt cấp 1 (Minh) — cần bạn duyệt cấp 2.",
    );
  });

  it("renders OQC XLBM events like the finished-product ones", () => {
    expect(
      render("oqc_xlbm_edit_proposed", { iqcCode: "OQC-1", editorName: "Lan" }),
    ).toBe("Lan vừa đề xuất sửa biên bản OQC OQC-1 — cần bạn duyệt.");
    expect(
      render("oqc_fp_director_created", {
        iqcCode: "OQC-2",
        materialCode: "SP-1",
        deliveryNo: "BBGH-5",
      }),
    ).toBe("Giám đốc vừa lập biên bản OQC OQC-2 cho lô SP-1 — BBGH-5.");
  });

  it("phrases the test-lab, sample-order and service SO events", () => {
    expect(
      render("test_lab_created", {
        testLabCode: "TL-1",
        requestDepartment: "planning",
        materialName: "Thép",
      }),
    ).toBe(
      "Yêu cầu test lab TL-1 (Kế hoạch — Thép) vừa được tạo, đang chờ duyệt.",
    );
    expect(
      render("test_lab_overdue", {
        testLabCode: "TL-1",
        deadline: "2026-10-09",
        status: "awaitingResult",
      }),
    ).toBe(
      'Yêu cầu test lab TL-1 đã đến/quá Deadline (09/10/2026) nhưng chưa có kết quả test (đang ở trạng thái "Đang chờ kết quả").',
    );
    expect(
      render("sample_order_da_giao", {
        sampleCode: "SO-1",
        productName: "Bulong",
        customerName: "ABC",
      }),
    ).toBe(
      "Sample Order SO-1 (Bulong — ABC) đã giao thành công cho khách hàng.",
    );
    expect(
      render("service_revenue_created", {
        orderCode: "SV-1",
        customerName: "ABC",
      }),
    ).toBe("SO dịch vụ SV-1 vừa được tạo cho khách ABC.");
  });

  it("opens delivery-plan notices with the actor and formats calibration dates", () => {
    expect(
      render("delivery_plan.cancelled", {
        actorName: "Lan",
        planCode: "KH-1",
        customerName: "ABC",
        cancelReason: "Hết hàng",
      }),
    ).toBe("Lan đã huỷ kế hoạch giao hàng KH-1 — ABC. Lý do: Hết hàng.");
    expect(
      render("equipment_calibration_overdue", {
        equipmentCode: "TB-1",
        nextCalibrationDate: "2026-10-01",
      }),
    ).toContain("từ 01/10/2026");
  });

  it("translates the purchase-request department inside the phrasing", () => {
    expect(
      render("purchaseRequestAwaitingReceipt", {
        prId: "PR-1",
        department: "surfaceTreatment",
      }),
    ).toBe("Yêu cầu mua hàng PR-1 (XLBM) đang chờ tiếp nhận.");
  });

  it("no longer lists the two removed VTTM delivery-note events", () => {
    const keys = NOTIFICATION_EVENT_KEYS as readonly string[];
    expect(keys).not.toContain(
      "commercial_goods_delivery_note_cancel_withdrawn",
    );
    expect(keys).not.toContain(
      "commercial_goods_delivery_note_cancel_recalled",
    );
  });

  it("has a phrasing in both languages for every known event", () => {
    for (const eventType of NOTIFICATION_EVENT_KEYS) {
      for (const t of [tVi, tEn]) {
        expect(render(eventType, { sfgCode: "X" }, t), eventType).not.toBe(
          t("fallbackMessage"),
        );
      }
    }
  });

  it("gates the bell on the scopes the new events are stamped with", () => {
    expect(NOTIFICATION_REQUIRED_SCOPES).toEqual(
      expect.arrayContaining([
        "test_lab:read",
        "service_revenue:read",
        "maintenance_registration:read",
        "semi_finished_receipt_ok:read",
      ]),
    );
  });
});
