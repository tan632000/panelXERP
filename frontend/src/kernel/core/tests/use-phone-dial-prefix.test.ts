import { renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";

import { usePhoneDialPrefix } from "@/kernel/core/hooks/usePhoneDialPrefix";
import { optionalPhoneSchema } from "@/kernel/core/lib/validators";

interface PhoneForm {
  phone: string;
}

function renderPrefix(dialCode: string | undefined, phone = "") {
  return renderHook(
    ({ dial }: { dial: string | undefined }) => {
      const form = useForm<PhoneForm>({ defaultValues: { phone } });
      usePhoneDialPrefix({ form, name: "phone", dialCode: dial });
      return form;
    },
    { initialProps: { dial: dialCode } },
  );
}

describe("usePhoneDialPrefix", () => {
  it("seeds an empty phone field with the country dial prefix", () => {
    const { result } = renderPrefix("+84");
    expect(result.current.getValues("phone")).toBe("+84-");
  });

  it("leaves a phone the record already carries untouched", () => {
    const { result } = renderPrefix("+84", "+84-912345678");
    expect(result.current.getValues("phone")).toBe("+84-912345678");
  });

  it("swaps the prefix and keeps the typed number when the country changes", () => {
    const { result, rerender } = renderPrefix("+84");
    result.current.setValue("phone", "+84-912345678");

    rerender({ dial: "+81" });

    expect(result.current.getValues("phone")).toBe("+81-912345678");
  });

  it("seeds nothing while the country is unknown", () => {
    const { result } = renderPrefix(undefined);
    expect(result.current.getValues("phone")).toBe("");
  });
});

describe("optionalPhoneSchema", () => {
  const schema = optionalPhoneSchema({
    phoneInvalid: "invalid",
    phoneMax: "too long",
  });

  it("reads a field left at just the seeded prefix as empty", () => {
    expect(schema.parse("+84-")).toBe("");
  });

  it("keeps a completed number", () => {
    expect(schema.parse("+84-912345678")).toBe("+84-912345678");
  });
});
