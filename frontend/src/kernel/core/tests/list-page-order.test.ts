import { describe, expect, it } from "vitest";

import {
  compareNewestFirst,
  orderDocumentLines,
  orderUnsortedPage,
} from "@/kernel/core/lib/list-page-order";

/** A page as the API hands it back: two documents, their lines interleaved by the sorted column. */
const PAGE = [
  { receiptNo: "PNK-TP-2026-0002", lineIndex: 1, fgCode: "TP_0001" },
  { receiptNo: "PNK-TP-2026-0001", lineIndex: 0, fgCode: "TP_0004" },
  { receiptNo: "PNK-TP-2026-0002", lineIndex: 0, fgCode: "TP_0009" },
];

/**
 * Every list here sorts in the database, over every row rather than the page the client
 * holds. Reordering that page in the table is what made the sort arrows look dead on every
 * column but the document number, so the rule guarded here is that a sorted page is left alone.
 */
describe("orderDocumentLines", () => {
  it("keeps the API's order while a column is sorted", () => {
    const rows = orderDocumentLines(
      PAGE,
      { key: "fgCode", direction: "ASC" },
      (row) => row.receiptNo,
    );

    expect(rows.map((row) => row.fgCode)).toEqual([
      "TP_0001",
      "TP_0004",
      "TP_0009",
    ]);
  });

  it("reads document by document while no column is sorted", () => {
    const rows = orderDocumentLines(PAGE, undefined, (row) => row.receiptNo);

    expect(rows.map((row) => `${row.receiptNo}#${row.lineIndex}`)).toEqual([
      "PNK-TP-2026-0001#0",
      "PNK-TP-2026-0002#0",
      "PNK-TP-2026-0002#1",
    ]);
  });

  it("leaves the page it was given untouched", () => {
    const page = [...PAGE];

    orderDocumentLines(page, undefined, (row) => row.receiptNo);

    expect(page).toEqual(PAGE);
  });
});

/** A page of documents as a list opens it: two days, and two documents entered on the later one. */
const DOCUMENTS = [
  { id: 4, issueDate: "2026-09-18" },
  { id: 9, issueDate: "2026-09-20" },
  { id: 7, issueDate: "2026-09-20" },
];

describe("orderUnsortedPage", () => {
  it("keeps the API's order while a column is sorted", () => {
    const rows = orderUnsortedPage(
      DOCUMENTS,
      true,
      compareNewestFirst((row) => row.issueDate),
    );

    expect(rows.map((row) => row.id)).toEqual([4, 9, 7]);
  });

  it("applies the list's own order while no column is sorted", () => {
    const rows = orderUnsortedPage(
      DOCUMENTS,
      false,
      compareNewestFirst((row) => row.issueDate),
    );

    expect(rows.map((row) => row.id)).toEqual([9, 7, 4]);
  });

  it("leaves the page it was given untouched", () => {
    const page = [...DOCUMENTS];

    orderUnsortedPage(
      page,
      false,
      compareNewestFirst((row) => row.issueDate),
    );

    expect(page).toEqual(DOCUMENTS);
  });
});
