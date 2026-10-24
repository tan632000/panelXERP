import { contactFeature } from "@plugins/crm/contact/contact.feature";
import { customerFeature } from "@plugins/crm/customer/customer.feature";
import { projectFeature } from "@plugins/crm/project/project.feature";

import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

/**
 * CRM feature catalog. Contacts have no sidebar entry: they are a section of the customer
 * detail screen, and the `contact` key lets a deployment switch that section off.
 */
export const CRM_FRONTEND_FEATURES: ErpFrontendFeature[] = [
  customerFeature,
  contactFeature,
  projectFeature,
];
