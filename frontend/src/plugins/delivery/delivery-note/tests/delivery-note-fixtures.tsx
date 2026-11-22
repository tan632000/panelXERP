import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import React from "react";

import { NotificationProvider } from "@/kernel/core/contexts/NotificationContext";
import viCommon from "@/kernel/langs/vi/common.json";
import viDelivery from "@/kernel/langs/vi/delivery.json";
import viModal from "@/kernel/langs/vi/modal.json";
import viOrder from "@/kernel/langs/vi/order.json";
import viStatus from "@/kernel/langs/vi/status.json";

import type {
  DeliveryNoteDetail,
  DeliveryOrderDetail,
  DeliveryOrderUnit,
} from "@plugins/delivery/delivery-note/types";

export function renderWithProviders(page: React.ReactElement) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider
        locale="vi"
        messages={{
          common: viCommon,
          delivery: viDelivery,
          modal: viModal,
          order: viOrder,
          status: viStatus,
        }}
      >
        <NotificationProvider>{page}</NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

export function noteDetail(
  overrides: Partial<DeliveryNoteDetail> = {},
): DeliveryNoteDetail {
  return {
    id: 5,
    code: "PGH_2026_0001",
    orderId: 4,
    orderCode: "DH_2026_0001",
    customerName: "Alpha Panels",
    projectName: "Tower A",
    status: "draft",
    plannedDate: "2026-12-01",
    deliveryAddress: "1 Demo Street",
    note: null,
    unitCount: 2,
    shippedAt: null,
    receivedDate: null,
    receiverName: null,
    cancelReason: null,
    cancelledAt: null,
    createdAt: "2026-11-20T03:00:00.000Z",
    units: [
      { unitId: 11, code: "MSB-01-1" },
      { unitId: 12, code: "MSB-01-2" },
    ],
    files: [],
    ...overrides,
  };
}

export function orderUnit(
  unitId: number,
  overrides: Partial<DeliveryOrderUnit> = {},
): DeliveryOrderUnit {
  return {
    unitId,
    code: `MSB-01-${unitId}`,
    tag: "MSB-01",
    description: null,
    qcStatus: "passed",
    deliveryStatus: "none",
    deliveryNoteCode: null,
    ...overrides,
  };
}

export function orderDetail(
  overrides: Partial<DeliveryOrderDetail> = {},
): DeliveryOrderDetail {
  return {
    orderId: 4,
    code: "DH_2026_0001",
    status: "in_production",
    customerName: "Alpha Panels",
    projectName: "Tower A",
    siteAddress: "Công trình Tower A, Quận 1",
    units: [],
    notes: [],
    ...overrides,
  };
}
