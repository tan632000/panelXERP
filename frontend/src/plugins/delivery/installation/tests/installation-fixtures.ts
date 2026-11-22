import type {
  InstallationDetail,
  InstallationSummary,
} from "@plugins/delivery/installation/types";

export function installationDetail(
  overrides: Partial<InstallationDetail> = {},
): InstallationDetail {
  return {
    id: 7,
    orderId: 4,
    orderCode: "DH_2026_0001",
    customerName: "Alpha Panels",
    projectName: "Tower A",
    status: "planned",
    siteAddress: "Công trình Tower A, Quận 1",
    plannedDate: "2026-12-10",
    personInCharge: "Anh Minh",
    note: null,
    photoCount: 0,
    startedAt: null,
    doneAt: null,
    createdAt: "2026-11-20T03:00:00.000Z",
    photos: [],
    ...overrides,
  };
}

export function installationSummary(
  detail: InstallationDetail,
): InstallationSummary {
  const { photos: _photos, ...summary } = detail;
  return summary;
}
