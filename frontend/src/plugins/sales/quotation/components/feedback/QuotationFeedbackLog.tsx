"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { DateInput } from "@/kernel/core/components/ui/DateInput";
import { DetailPanelActionButton } from "@/kernel/core/components/ui/DetailPanelActionButton";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { FormControl } from "@/kernel/core/components/ui/FormControl";
import { FormTextArea } from "@/kernel/core/components/ui/FormTextArea";
import { SegmentedTabs } from "@/kernel/core/components/ui/SegmentedTabs";
import { formatIsoDate } from "@/kernel/core/lib/formatters";

import {
  FEEDBACK_CHANNELS,
  FEEDBACK_CONTENT_MAX,
  type FeedbackChannel,
} from "@plugins/sales/quotation/constants";
import {
  useAddQuotationFeedback,
  useQuotationFeedbackLog,
} from "@plugins/sales/quotation/hooks/api/useQuotationApproval";
import { QuotationPermission } from "@plugins/sales/quotation/permissions/quotation-permission.keys";

/** Today as `YYYY-MM-DD` in the viewer's own calendar, the form's starting date. */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * What the customer answered, newest first, with the form that records one more answer (date,
 * channel, what was said). The log is append-only: an entry is never edited.
 */
export function QuotationFeedbackLog({ quotationId }: { quotationId: number }) {
  const t = useTranslations("quotation.feedback");
  const { can } = useAuth();
  const entries = useQuotationFeedbackLog(quotationId);
  const add = useAddQuotationFeedback(quotationId);

  const [feedbackDate, setFeedbackDate] = useState(today);
  const [channel, setChannel] = useState<FeedbackChannel>("phone");
  const [content, setContent] = useState("");

  const trimmed = content.trim();
  const valid =
    feedbackDate.length > 0 &&
    trimmed.length > 0 &&
    trimmed.length <= FEEDBACK_CONTENT_MAX;

  const submit = () =>
    add.mutate(
      { feedbackDate, channel, content: trimmed },
      { onSuccess: () => setContent("") },
    );

  return (
    <DetailSection title={t("title")}>
      <div className="flex flex-col gap-4">
        {can(QuotationPermission.update) ? (
          <div className="flex flex-col gap-3 rounded-md border border-border-secondary p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormControl label={t("date")}>
                <DateInput value={feedbackDate} onChange={setFeedbackDate} />
              </FormControl>
              <FormControl label={t("channel")}>
                <SegmentedTabs
                  aria-label={t("channel")}
                  activeKey={channel}
                  onChange={(key) => setChannel(key as FeedbackChannel)}
                  items={FEEDBACK_CHANNELS.map((key) => ({
                    key,
                    label: t(`channels.${key}`),
                  }))}
                />
              </FormControl>
            </div>
            <FormTextArea
              label={t("content")}
              placeholder={t("contentPlaceholder")}
              rows={3}
              maxLength={FEEDBACK_CONTENT_MAX}
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
            <div>
              <DetailPanelActionButton
                variant="primary"
                icon="plus"
                label={t("add")}
                disabled={!valid || add.isPending}
                onClick={submit}
              />
            </div>
          </div>
        ) : null}

        {entries.data && entries.data.length > 0 ? (
          <ul className="flex flex-col gap-2" data-testid="feedback-entries">
            {entries.data.map((entry) => (
              <li
                key={entry.id}
                className="rounded-md border border-border-secondary px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2 text-text-secondary">
                  <span className="font-semibold tabular-nums text-text-primary">
                    {formatIsoDate(entry.feedbackDate)}
                  </span>
                  <span>{t(`channels.${entry.channel}`)}</span>
                  {entry.createdByName ? (
                    <span>{entry.createdByName}</span>
                  ) : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-text-primary">
                  {entry.content}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">
            {entries.isLoading ? t("loading") : t("empty")}
          </p>
        )}
      </div>
    </DetailSection>
  );
}
