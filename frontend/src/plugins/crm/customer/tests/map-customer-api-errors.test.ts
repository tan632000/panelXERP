import { describe, expect, it, vi } from "vitest";

import { axiosErrorWithMessage } from "@/test/helpers/axios-error";

import {
  mapCustomerApiErrorsToForm,
  resolveCustomerDeleteToastKey,
} from "@plugins/crm/customer/utils/map-customer-api-errors";

const translate = (key: string) => `t:${key}`;
const messages = { codeExists: "code exists" };

function map(message: string, status: number) {
  const setFieldError = vi.fn();
  mapCustomerApiErrorsToForm(
    axiosErrorWithMessage(message, status),
    setFieldError,
    messages,
    translate,
  );
  return setFieldError;
}

describe("mapCustomerApiErrorsToForm", () => {
  it("puts a duplicate code on the code field in the form's own words", () => {
    const setFieldError = map("Customer code already exists.", 409);
    expect(setFieldError).toHaveBeenCalledWith("code", "code exists");
  });

  it("maps a rejected owner assignment to the owner field", () => {
    const setFieldError = map(
      "Only a sales manager or director may assign a customer to another sales account.",
      400,
    );
    expect(setFieldError).toHaveBeenCalledWith(
      "salesOwnerId",
      "t:ownerNotAllowed",
    );
  });

  it("does not mistake the email address wording for the address field", () => {
    const setFieldError = map("Email must be a valid email address.", 400);
    expect(setFieldError).toHaveBeenCalledWith("email", "t:emailInvalid");
  });
});

describe("resolveCustomerDeleteToastKey", () => {
  it("recognises a delete refused because a document references the customer", () => {
    const error = axiosErrorWithMessage(
      "Cannot delete customer because it is referenced by sales documents.",
      409,
    );
    expect(resolveCustomerDeleteToastKey(error)).toBe("deleteInUseDocument");
  });
});
