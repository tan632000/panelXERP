import { useLocale, useTranslations } from "next-intl";

import {
  type CompanyProfile,
  getCompanyProfile,
} from "@/kernel/core/config/company.config";

import type { HpLetterheadLabels } from "@/kernel/core/lib/print/letterhead";

/** The deploying customer's identity in the active locale — for letterheads and printed copy. */
export function useCompanyProfile(): CompanyProfile {
  return getCompanyProfile(useLocale());
}

/** The standard letterhead labels: name, address and the single `Tel … MST …` line. */
export function useCompanyLetterhead(): HpLetterheadLabels {
  const company = useCompanyProfile();
  const t = useTranslations("common.companyProfile");
  return {
    companyName: company.name,
    companyAddress: company.address,
    contactLines: [
      t("contactLine", { phone: company.phone, taxCode: company.taxCode }),
    ],
  };
}
