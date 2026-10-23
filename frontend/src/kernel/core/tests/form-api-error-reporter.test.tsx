import { renderHook, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import React from "react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { useFormApiErrorReporter } from "@/kernel/core/hooks/useFormApiErrorReporter";
import { hasFormFieldPath } from "@/kernel/core/lib/form-field-path";

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

const showError = vi.fn();

vi.mock("@/kernel/core/lib/toast", () => ({
  toast: {
    showError: (message: string) => showError(message),
  },
}));

interface Values {
  code: string;
  lines: Array<{ quantity: number }>;
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="vi" messages={{ fixture: viFixture }}>
      {children}
    </NextIntlClientProvider>
  );
}

function renderReporter() {
  return renderHook(
    () => {
      const form = useForm<Values>({
        defaultValues: { code: "", lines: [{ quantity: 1 }] },
      });
      return {
        form,
        report: useFormApiErrorReporter(form, "fixture.toast"),
      };
    },
    { wrapper },
  );
}

describe("useFormApiErrorReporter", () => {
  beforeEach(() => {
    showError.mockClear();
  });

  it("leaves a mapped rejection on its field without a toast", () => {
    const { result } = renderReporter();

    act(() => {
      result.current.report(new Error("rejected"), (setFieldError) => {
        setFieldError("code", "Mã đã tồn tại.");
        return true;
      });
    });

    expect(result.current.form.getFieldState("code").error?.message).toBe(
      "Mã đã tồn tại.",
    );
    expect(showError).not.toHaveBeenCalled();
  });

  it("announces a rejection the mapper could not place", () => {
    const { result } = renderReporter();

    act(() => {
      result.current.report(new Error("rejected"), () => false);
    });

    expect(showError).toHaveBeenCalledWith(viFixture.toast.systemError);
  });

  it("announces a rejection aimed at a field the form does not own", () => {
    const { result } = renderReporter();

    act(() => {
      result.current.report(new Error("rejected"), (setFieldError) => {
        setFieldError("unknownField", "Không hợp lệ.");
        return true;
      });
    });

    expect(showError).toHaveBeenCalledWith(viFixture.toast.systemError);
  });
});

describe("hasFormFieldPath", () => {
  const values = { code: "", lines: [{ quantity: 1 }], notes: undefined };

  it("accepts a key the form owns even when its value is undefined", () => {
    expect(hasFormFieldPath(values, "notes")).toBe(true);
  });

  it("accepts an indexed path inside a field array", () => {
    expect(hasFormFieldPath(values, "lines.0.quantity")).toBe(true);
  });

  it("rejects an index past the end of a field array", () => {
    expect(hasFormFieldPath(values, "lines.3.quantity")).toBe(false);
  });

  it("rejects a name the form does not own", () => {
    expect(hasFormFieldPath(values, "unknownField")).toBe(false);
  });
});
