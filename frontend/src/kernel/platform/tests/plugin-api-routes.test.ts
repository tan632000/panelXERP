import { describe, expect, it } from "vitest";

import { apiRoutes } from "@/kernel/core/constants/apiRoutes";

import { contactApiRoutes } from "@plugins/crm/contact/constants";
import {
  customerApiRoutes,
  customerPageRoutes,
} from "@plugins/crm/customer/constants";

describe("apiRoutes", () => {
  it("should expose auth me endpoint", () => {
    expect(apiRoutes.auth.me).toBe("/auth/me");
  });

  it("should expose health endpoint", () => {
    expect(apiRoutes.health).toBe("/health");
  });

  it("should expose the crm customer and contact routes", () => {
    expect(customerApiRoutes.detail(7)).toBe("/customers/7");
    expect(customerApiRoutes.bulkDelete).toBe("/customers/bulk-delete");
    expect(customerPageRoutes.detail(7)).toBe("/crm/customers/7");
    expect(contactApiRoutes.detail(3)).toBe("/contacts/3");
  });
});
