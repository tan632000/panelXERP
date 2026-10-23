import { z } from "zod";

import {
  isPhoneDialPrefixOnly,
  phoneStartsWithDialCode,
} from "@/kernel/core/constants/country-dial-codes";

export const PHONE_REGEX = /^\+?\d+(-\d+)*$/;

export function isValidPhone(value: string): boolean {
  return value === "" || PHONE_REGEX.test(value);
}

export function optionalPhoneSchema(messages: {
  phoneInvalid: string;
  phoneMax: string;
  maxLength?: number;
}) {
  return z.preprocess(
    // The form seeds the country dial prefix; a field left at just that prefix is not a number.
    (value) => (isPhoneDialPrefixOnly(value as string) ? "" : value),
    z
      .string()
      .max(messages.maxLength ?? 20, messages.phoneMax)
      .refine((v) => isValidPhone(v), {
        message: messages.phoneInvalid,
      }),
  );
}

export function isValidWebsiteUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/\s/.test(trimmed)) return false;

  const withoutScheme = trimmed.replace(/^https?:\/\//i, "");
  const hostPort = withoutScheme.split("/")[0] ?? "";
  if (/^\d+(\.\d+)*(:\d+)?$/i.test(hostPort)) return false;

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const host = url.hostname;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  if (host.includes(":")) return false;

  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i.test(
    host,
  );
}

export function normalizeWebsiteUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function optionalWebsiteSchema(message: string) {
  return z.string().refine((v) => isValidWebsiteUrl(v), { message });
}

export function refinePhoneMatchesDialCode(params: {
  phone: string | undefined;
  dialCode: string | undefined;
  path?: Array<string | number>;
  message: string;
  ctx: z.RefinementCtx;
}): void {
  const phone = params.phone?.trim() ?? "";
  if (!phone || !params.dialCode) return;
  if (!phoneStartsWithDialCode(phone, params.dialCode)) {
    params.ctx.addIssue({
      code: "custom",
      path: params.path ?? ["phone"],
      message: params.message,
    });
  }
}

/**
 * A blank numeric input means "not provided". `z.coerce.number()` alone turns `""` into `0`,
 * which persists a real zero and then reads back as a fixed-scale `0.0000`.
 */
export function optionalNumberSchema() {
  return z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().optional(),
  );
}

/**
 * A VAT rate field: blank means "no rate entered" and travels as `null`, so it reads back as
 * a dash rather than `0%`; an entered rate (zero included) must sit in 0–100.
 */
export function optionalVatPctSchema(message: string) {
  return z.preprocess(
    (value) =>
      value === "" || value === null || value === undefined ? null : value,
    z.coerce
      .number({ error: () => message })
      .min(0, message)
      .max(100, message)
      .nullable(),
  );
}

export function optionalMaxString(max: number, message: string) {
  return z.string().max(max, message).optional().or(z.literal(""));
}
