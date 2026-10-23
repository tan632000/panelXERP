/**
 * The deploying customer's legal identity, printed on every letterhead, PDF and stamp.
 *
 * Every value comes from the build env (see `.env.example` → `COMPANY_*`), so the same code ships
 * to any customer. NEXT_PUBLIC_* must be read through direct `process.env.NEXT_PUBLIC_*`
 * references so Next.js inlines them into the client bundle.
 */
export interface CompanyProfile {
  /** Legal name as printed on letterheads. */
  name: string;
  /** Short name used inside running text (terms, quotation intro). */
  shortName: string;
  address: string;
  phone: string;
  taxCode: string;
}

function env(value: string | undefined): string {
  return value?.trim() ?? "";
}

const vi: CompanyProfile = {
  name: env(process.env.NEXT_PUBLIC_COMPANY_NAME_VI),
  shortName: env(process.env.NEXT_PUBLIC_COMPANY_SHORT_NAME_VI),
  address: env(process.env.NEXT_PUBLIC_COMPANY_ADDRESS_VI),
  phone: env(process.env.NEXT_PUBLIC_COMPANY_PHONE),
  taxCode: env(process.env.NEXT_PUBLIC_COMPANY_TAX_CODE),
};

/** English values fall back to the Vietnamese ones when a deployment does not set them. */
const en: CompanyProfile = {
  ...vi,
  name: env(process.env.NEXT_PUBLIC_COMPANY_NAME_EN) || vi.name,
  shortName: env(process.env.NEXT_PUBLIC_COMPANY_SHORT_NAME_EN) || vi.shortName,
  address: env(process.env.NEXT_PUBLIC_COMPANY_ADDRESS_EN) || vi.address,
};

export function getCompanyProfile(locale: string): CompanyProfile {
  return locale === "en" ? en : vi;
}
