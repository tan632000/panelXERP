import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

/**
 * The contacts section of the customer detail screen. It owns no sidebar item, so it only
 * exists as a key the feature toggle and `ContactSection` read.
 */
export const contactFeature: ErpFrontendFeature = {
  key: "contact",
  plugin: "crm",
  dependsOn: ["customer"],
  items: [],
};
