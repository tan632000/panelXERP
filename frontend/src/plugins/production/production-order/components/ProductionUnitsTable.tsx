"use client";

import { isValid, parse } from "date-fns";
import { useTranslations } from "next-intl";
import React, { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { DateInput } from "@/kernel/core/components/ui/DateInput";
import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import { toIsoDate } from "@/kernel/core/lib/date-picker-utils";
import { formatIsoDate } from "@/kernel/core/lib/formatters";
import { Link } from "@/kernel/i18n/navigation";

import {
  PLANNED_END_DATE_MAX,
  PLANNED_END_DATE_MIN,
} from "@plugins/production/production-order/constants";
import { UnitProgressCell } from "@plugins/production/progress/components/UnitProgressCell";
import { progressPageRoutes } from "@plugins/production/progress/constants";
import { ProductionProgressPermission } from "@plugins/production/progress/permissions/progress-permission.keys";

import type {
  ProductionUnit,
  TechnicianOption,
  UnitUpdateInput,
} from "@plugins/production/production-order/types";

const PLAIN = { filterable: false, sortable: false } as const;

interface Props {
  units: ProductionUnit[];
  /** Technician and date are editable cells; otherwise they read as text. */
  editable: boolean;
  technicians: TechnicianOption[];
  busy: boolean;
  /** `onFailed` runs when the change is refused, so an edited cell can show the saved value again. */
  onChange: (
    unitId: number,
    changes: UnitUpdateInput,
    onFailed?: () => void,
  ) => void;
}

/** One row per physical cabinet: who builds it and by when. */
export function ProductionUnitsTable({
  units,
  editable,
  technicians,
  busy,
  onChange,
}: Readonly<Props>) {
  const t = useTranslations("production");
  const { can } = useAuth();
  const canOpenUnit = can(ProductionProgressPermission.read);

  const columns: Array<TableColumn<ProductionUnit>> = [
    {
      key: "code",
      ...PLAIN,
      mobile: { role: "title", record: true },
      header: t("units.code"),
      render: (_, row) =>
        canOpenUnit ? (
          <Link
            href={progressPageRoutes.unit(row.id)}
            className="font-mono font-semibold text-brand underline"
          >
            {row.code}
          </Link>
        ) : (
          <span className="font-mono font-semibold">{row.code}</span>
        ),
    },
    {
      key: "description",
      ...PLAIN,
      header: t("units.description"),
      render: (_, row) => row.description ?? t("emptyValue"),
    },
    {
      key: "assigneeId",
      ...PLAIN,
      header: t("units.assignee"),
      render: (_, row) => {
        if (!editable) return row.assigneeName ?? t("units.unassigned");
        // A former technician stays visible until the cabinet is reassigned.
        const known = technicians.some((tech) => tech.id === row.assigneeId);
        return (
          <select
            aria-label={t("units.assigneeOf", { code: row.code })}
            className="h-9 w-full rounded-[7px] border border-border-secondary bg-surface-primary px-2 text-sm"
            value={row.assigneeId ?? ""}
            disabled={busy}
            onChange={(event) => {
              if (event.target.value === "") return;
              onChange(row.id, { assigneeId: Number(event.target.value) });
            }}
          >
            <option value="">{t("units.pickTechnician")}</option>
            {row.assigneeId !== null && !known ? (
              <option value={row.assigneeId}>{row.assigneeName}</option>
            ) : null}
            {technicians.map((tech) => (
              <option key={tech.id} value={tech.id}>
                {tech.name}
              </option>
            ))}
          </select>
        );
      },
    },
    {
      key: "plannedEndDate",
      ...PLAIN,
      header: t("units.plannedEndDate"),
      render: (_, row) => {
        if (!editable) {
          return row.plannedEndDate
            ? formatIsoDate(row.plannedEndDate)
            : t("emptyValue");
        }
        return (
          <PlannedEndDateCell
            saved={row.plannedEndDate ?? ""}
            onCommit={(value, onFailed) =>
              onChange(row.id, { plannedEndDate: value }, onFailed)
            }
          />
        );
      },
    },
    {
      key: "progress",
      ...PLAIN,
      header: t("units.progress"),
      render: (_, row) => (
        <UnitProgressCell
          doneCount={row.doneCount}
          currentStage={row.currentStage}
        />
      ),
    },
  ];

  return (
    <Table columns={columns} data={units} rowKey={(row) => String(row.id)} />
  );
}

/** The calendar is portalled outside the cell; moving into it does not leave the field. */
const CALENDAR_SELECTOR = ".date-input-popper";

/**
 * A cabinet's planned end date, saved once it is finished: on leaving the field, on Enter, or
 * on a pick from the calendar. A typed date is read from the field's text at that moment,
 * not from the picker's change reports, which skip a date equal to the one shown and fire
 * for "2/11/2026" while "26/11/2026" is still being typed. The field stays enabled while a
 * save runs, so keys typed into the next cabinet are not lost.
 */
function PlannedEndDateCell({
  saved,
  onCommit,
}: Readonly<{
  saved: string;
  onCommit: (value: string, onFailed: () => void) => void;
}>) {
  const [draft, setDraft] = useState(saved);
  // A saved date replaces the draft; adjusted while rendering so the field is not remounted.
  const [prevSaved, setPrevSaved] = useState(saved);
  // Counts every saved date that arrives, so one that comes back to an earlier value still counts.
  const [savedVersion, setSavedVersion] = useState(0);
  if (saved !== prevSaved) {
    setPrevSaved(saved);
    setDraft(saved);
    setSavedVersion((version) => version + 1);
  }
  // A refused save settles after later renders; its handler reads the newest saved date here.
  const latest = useRef({ saved, version: savedVersion });
  useEffect(() => {
    latest.current = { saved, version: savedVersion };
  });
  const rootRef = useRef<HTMLDivElement>(null);
  // Set while the cell blurs and refocuses its own field, which is not leaving it.
  const resetting = useRef(false);
  // The last date sent, so a pick of the saved date after a save of another is still sent.
  const sent = useRef(saved);
  // The saved version `sent` last followed; a newer one (a save, another change) replaces it.
  const sentFor = useRef(savedVersion);
  const lastSent = () => {
    if (sentFor.current !== latest.current.version) {
      sentFor.current = latest.current.version;
      sent.current = latest.current.saved;
    }
    return sent.current;
  };
  const calendarOpen = useRef(false);
  // The text left when focus went towards the open calendar's blank space; the picker puts the
  // shown date back into the field on blur, so it is read then and used when the calendar closes.
  const leftText = useRef<string | null>(null);

  const fieldText = () => rootRef.current?.querySelector("input")?.value ?? "";
  const focusedInside = () =>
    Boolean(rootRef.current?.contains(document.activeElement));

  // The picker keeps the typed text while the field has focus; a blur makes it show the date
  // again, so a focused field is blurred and focused once more.
  const showDate = (value: string) => {
    const input = rootRef.current?.querySelector("input");
    if (!input || document.activeElement !== input) {
      setDraft(value);
      return;
    }
    // Rendered first, so the picker shows this date when it resets its text on blur.
    flushSync(() => setDraft(value));
    resetting.current = true;
    input.blur();
    input.focus();
    resetting.current = false;
  };

  const commit = (value: string) => {
    setDraft(value);
    if (value === lastSent()) return;
    sent.current = value;
    onCommit(value, () => {
      // Follow the newest saved date, which another change may have replaced meanwhile.
      sentFor.current = -1;
      showDate(lastSent());
    });
  };
  // Leaving the field, Enter or a closing calendar: save the date the field shows, or put the
  // last date sent back when its text is empty or not a whole date (the API keeps a date once
  // set).
  const finish = (text: string) => {
    const typed = typedDate(text);
    if (typed) commit(typed);
    else showDate(lastSent());
  };

  return (
    <div
      ref={rootRef}
      onFocus={(event) => {
        // Focus on a calendar day bubbles here through the portal; only the field itself resumes typing.
        if (rootRef.current?.contains(event.target)) leftText.current = null;
      }}
      onBlur={(event) => {
        if (resetting.current) return;
        const next = event.relatedTarget;
        if (next instanceof Element && next.closest(CALENDAR_SELECTOR)) return;
        // A press on the open calendar's buttons or blank space leaves no focus target in some
        // browsers; its closing decides instead.
        if (next === null && calendarOpen.current) {
          // Only the field's own blur holds the typed text; the picker has reset it by the time a
          // calendar element blurs.
          if (rootRef.current?.contains(event.target)) {
            leftText.current = fieldText();
          }
          return;
        }
        if (!rootRef.current?.contains(next)) {
          finish(leftText.current ?? fieldText());
          leftText.current = null;
        }
      }}
      onKeyDown={(event) => {
        // Enter on a calendar day bubbles here through the portal; the pick itself saves it.
        const fromField =
          event.target instanceof Node &&
          rootRef.current?.contains(event.target);
        if (event.key === "Enter" && fromField) finish(fieldText());
      }}
    >
      <DateInput
        value={draft}
        min={PLANNED_END_DATE_MIN}
        max={PLANNED_END_DATE_MAX}
        onOpenChange={(open) => {
          calendarOpen.current = open;
          if (open || focusedInside()) return;
          finish(leftText.current ?? fieldText());
          leftText.current = null;
        }}
        onChange={(value) => {
          // Typing keeps focus in the field and is read on finishing; a calendar pick has moved
          // focus onto the day and is final.
          if (focusedInside() || value === "") return;
          leftText.current = null;
          commit(value);
        }}
      />
    </div>
  );
}

/** The date in the field's own "dd/MM/yyyy" text, when it is a whole one this cell takes. */
function typedDate(text: string): string | null {
  const date = parse(text.trim(), "dd/MM/yyyy", new Date());
  if (!isValid(date)) return null;
  const iso = toIsoDate(date);
  return iso >= PLANNED_END_DATE_MIN && iso <= PLANNED_END_DATE_MAX
    ? iso
    : null;
}
