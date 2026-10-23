"use client";

import { useTranslations } from "next-intl";
import React, { useEffect, useState } from "react";

import { Button } from "@/kernel/core/components/ui/Button";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { ProgressBar } from "@/kernel/core/components/ui/ProgressBar";
import {
  excelJobsStore,
  isExcelDownloadOpen,
  useExcelJobs,
  type ExcelJobEntry,
} from "@/kernel/core/lib/excel-jobs-store";
import { toast } from "@/kernel/core/lib/toast";

/** How often an open download window is re-checked, so an expired file loses its button. */
const EXPIRY_TICK_MS = 15_000;

const KNOWN_STAGES = new Set([
  "queued",
  "querying",
  "writing",
  "compressing",
  "uploading",
  "downloading",
  "reading",
  "done",
]);

const KNOWN_ERRORS = new Set([
  "exportTooLarge",
  "invalidSpec",
  "unknownField",
  "jobNotFound",
  "internal",
]);

function isTerminal(job: ExcelJobEntry): boolean {
  return (
    job.state === "completed" ||
    job.state === "failed" ||
    job.state === "connectionLost"
  );
}

function JobStatus({ job, now }: { job: ExcelJobEntry; now: number }) {
  const t = useTranslations("common");

  if (job.state === "failed") {
    const code = job.error?.code ?? "internal";
    return (
      <p className="text-xs text-danger-text">
        {t(`excel.error.${KNOWN_ERRORS.has(code) ? code : "internal"}`)}
      </p>
    );
  }
  if (job.state === "connectionLost") {
    return (
      <p className="text-xs text-warning-text">{t("excel.connectionLost")}</p>
    );
  }
  if (job.state !== "completed") {
    return (
      <>
        <ProgressBar
          percent={job.percent}
          ariaLabel={job.label}
          className="mt-1"
        />
        <p className="text-xs text-text-secondary">
          {t(
            `excel.stage.${KNOWN_STAGES.has(job.stage) ? job.stage : "queued"}`,
          )}{" "}
          · {job.percent}%
        </p>
      </>
    );
  }
  if (job.kind !== "export") {
    return <p className="text-xs text-success-text">{t("excel.stage.done")}</p>;
  }
  if (job.download === "downloaded") {
    return <p className="text-xs text-success-text">{t("excel.downloaded")}</p>;
  }
  if (job.download === "expired" || !isExcelDownloadOpen(job, now)) {
    return <p className="text-xs text-text-secondary">{t("excel.expired")}</p>;
  }

  const handleDownload = () => {
    excelJobsStore
      .download(job.id)
      .catch(() => toast.showError(t("excel.downloadFailed")));
  };

  return (
    <div className="mt-1 flex items-center justify-between gap-2">
      <p className="text-xs text-text-secondary">{t("excel.expiresHint")}</p>
      <Button
        className="px-3 py-1 text-xs"
        onClick={handleDownload}
        loading={job.download === "downloading"}
      >
        <Icon name="download" size={14} /> {t("excel.download")}
      </Button>
    </div>
  );
}

/**
 * The Excel jobs started in this tab, pinned to the bottom-right of every module screen:
 * each one's stage and progress while it runs, then its outcome and, for an export, the
 * one-time download of its zip.
 */
export function ExcelJobsPanel() {
  const t = useTranslations("common");
  const jobs = useExcelJobs();
  const [now, setNow] = useState(() => Date.now());
  const hasOpenDownload = jobs.some((job) => isExcelDownloadOpen(job));

  useEffect(() => {
    if (!hasOpenDownload) return;
    const timer = setInterval(() => setNow(Date.now()), EXPIRY_TICK_MS);
    return () => clearInterval(timer);
  }, [hasOpenDownload]);

  if (jobs.length === 0) return null;

  return (
    <section
      aria-label={t("excel.jobsTitle")}
      className="fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2"
    >
      {jobs.map((job) => (
        <article
          key={job.id}
          className="rounded-[9px] border border-border-secondary bg-surface-primary px-3 py-2.5 shadow-lg"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-semibold text-text-primary">
              {job.label}
            </p>
            {isTerminal(job) ? (
              <button
                type="button"
                aria-label={t("excel.dismiss")}
                className="text-text-secondary hover:text-text-primary"
                onClick={() => excelJobsStore.dismiss(job.id)}
              >
                <Icon name="x" size={14} />
              </button>
            ) : null}
          </div>
          <JobStatus job={job} now={now} />
        </article>
      ))}
    </section>
  );
}
