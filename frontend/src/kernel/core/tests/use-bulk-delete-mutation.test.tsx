import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useBulkDeleteMutation } from "@/kernel/core/hooks/api/useBulkDeleteMutation";
import viCommon from "@/kernel/langs/vi/common.json";

import type { BulkDeleteResult } from "@/kernel/core/types/bulk-delete";

/** A feature toast namespace, standing in for a plugin bundle. */
const viFixture = {
  toast: {
    createMaterialSuccess: "Tạo nguyên vật liệu thành công.",
    updateMaterialSuccess: "Cập nhật nguyên vật liệu thành công.",
    deleteMaterialSuccess: "Xoá nguyên vật liệu thành công.",
    deleteInUseProduct:
      "Không thể xoá vì nguyên vật liệu đang được sử dụng trong Sản phẩm nội bộ.",
    deleteInUseDocument:
      "Không thể xoá vì nguyên vật liệu đang được sử dụng trong chứng từ nghiệp vụ.",
    systemError: "Đã có lỗi xảy ra, vui lòng thử lại sau.",
    forbidden: "Bạn không có quyền thực hiện chức năng này.",
    nextCodeFailed: "Không lấy được mã tự động. Vui lòng thử lại.",
  },
};

const showSuccess = vi.fn();
const showError = vi.fn();
const showWarning = vi.fn();

vi.mock("@/kernel/core/contexts/NotificationContext", () => ({
  useNotification: () => ({ showSuccess, showError, showWarning }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <NextIntlClientProvider
      locale="vi"
      messages={{ common: viCommon, fixture: viFixture }}
    >
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

function renderBulkDelete(result: BulkDeleteResult) {
  const mutationFn = vi.fn().mockResolvedValue(result);
  const onDeleted = vi.fn();
  const view = renderHook(
    () =>
      useBulkDeleteMutation({
        mutationFn,
        toastNamespace: "fixture.toast",
        invalidateQueryKey: ["rows"],
        onDeleted,
      }),
    { wrapper },
  );
  return { ...view, mutationFn, onDeleted };
}

afterEach(() => {
  showSuccess.mockReset();
  showError.mockReset();
  showWarning.mockReset();
});

describe("useBulkDeleteMutation", () => {
  it("reports the rows it deleted even when the batch kept some", async () => {
    const { result, onDeleted } = renderBulkDelete({
      deleted: [1, 2],
      failed: [{ id: 3, message: "Cannot delete." }],
    });

    result.current.mutate([1, 2, 3]);

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith([1, 2]));
    expect(showSuccess).toHaveBeenCalledWith("Đã xoá 2 dòng.");
    // Why the third row stayed is the report's job, not a toast's.
    expect(showError).not.toHaveBeenCalled();
    expect(showWarning).not.toHaveBeenCalled();
  });

  it("says nothing when the batch deleted no row", async () => {
    const { result } = renderBulkDelete({
      deleted: [],
      failed: [{ id: 3, message: "Cannot delete." }],
    });

    result.current.mutate([3]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(showSuccess).not.toHaveBeenCalled();
  });

  it("unticks only the rows that went", async () => {
    const { onDeleted, result } = renderBulkDelete({
      deleted: [5],
      failed: [{ id: 6, message: "Cannot delete." }],
    });

    result.current.mutate([5, 6]);

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith([5]));
  });
});
