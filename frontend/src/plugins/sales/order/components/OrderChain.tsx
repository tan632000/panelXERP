"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { Link } from "@/kernel/i18n/navigation";

import { estimatePageRoutes } from "@plugins/sales/estimate/constants";
import { quotationPageRoutes } from "@plugins/sales/quotation/constants";
import { requestPageRoutes } from "@plugins/sales/request/constants";

import type { OrderChain as OrderChainLinks } from "@plugins/sales/order/types";

interface OrderChainProps {
  chain: OrderChainLinks;
  orderCode: string;
}

/**
 * Where the order came from: request → estimate → quotation → order, each a link to its own
 * page except the order the reader is on.
 */
export function OrderChain({ chain, orderCode }: OrderChainProps) {
  const t = useTranslations("order.chain");

  const steps = [
    {
      key: "request",
      label: t("request"),
      text: chain.request.code,
      href: requestPageRoutes.detail(chain.request.id),
    },
    {
      key: "estimate",
      label: t("estimate"),
      text: `${chain.estimate.code} #${chain.estimate.revision}`,
      href: estimatePageRoutes.detail(chain.estimate.id),
    },
    {
      key: "quotation",
      label: t("quotation"),
      text: `${chain.quotation.code} v${chain.quotation.ver}`,
      href: quotationPageRoutes.detail(chain.quotation.id),
    },
    { key: "order", label: t("order"), text: orderCode, href: null },
  ];

  return (
    <nav aria-label={t("title")}>
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {steps.map((step, index) => (
          <li key={step.key} className="flex items-center gap-2">
            {index > 0 ? (
              <Icon
                name="chevron-right"
                size={14}
                className="text-text-tertiary"
              />
            ) : null}
            <span className="text-text-tertiary">{step.label}</span>
            {step.href ? (
              <Link href={step.href} className="font-mono font-semibold">
                {step.text}
              </Link>
            ) : (
              <span
                className="font-mono font-semibold text-text-primary"
                aria-current="page"
              >
                {step.text}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
