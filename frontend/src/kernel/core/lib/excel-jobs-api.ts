import api from "@/kernel/core/api/api";
import { multipartRequestConfig } from "@/kernel/core/lib/multipart";

import type {
  ExcelImportError,
  ExcelImportRow,
  ExcelJobSnapshot,
  ExcelSheetSpec,
} from "@/kernel/core/types/excel";

export const excelApiRoutes = {
  template: "/excel/template",
  parse: "/excel/parse",
  job: (id: string) => `/excel/jobs/${encodeURIComponent(id)}`,
  events: (id: string) => `/excel/jobs/${encodeURIComponent(id)}/events`,
  result: (id: string) => `/excel/jobs/${encodeURIComponent(id)}/result`,
  download: (id: string) => `/excel/jobs/${encodeURIComponent(id)}/download`,
} as const;

/** Uploads of this size or larger are refused by the server; checked here first. */
export const EXCEL_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;

interface ApiErrorBody {
  error?: { code?: unknown; errors?: unknown } | string;
  errors?: unknown;
}

function errorBody(error: unknown): ApiErrorBody | undefined {
  return (error as { response?: { data?: ApiErrorBody } })?.response?.data;
}

export function excelApiStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

/** The `code` the kernel puts in an error body, e.g. `tooManyJobs` or `fileExpired`. */
export function excelApiErrorCode(error: unknown): string | undefined {
  const nested = errorBody(error)?.error;
  const code = typeof nested === "object" ? nested?.code : undefined;
  return typeof code === "string" ? code : undefined;
}

/** The per-row problems an error body carries, or one entry naming its code. */
export function excelApiErrorIssues(error: unknown): ExcelImportError[] {
  const body = errorBody(error);
  const nested = typeof body?.error === "object" ? body.error : undefined;
  const issues = body?.errors ?? nested?.errors;
  if (Array.isArray(issues) && issues.length > 0) {
    return issues as ExcelImportError[];
  }
  return [{ fileRow: 1, code: excelApiErrorCode(error) ?? "server" }];
}

export async function getExcelJob(id: string): Promise<ExcelJobSnapshot> {
  const { data } = await api.get<ExcelJobSnapshot>(excelApiRoutes.job(id));
  return data;
}

export async function getExcelParseRows(id: string): Promise<ExcelImportRow[]> {
  const { data } = await api.get<{ rows: ExcelImportRow[] }>(
    excelApiRoutes.result(id),
  );
  return data.rows;
}

export async function fetchExcelTemplate(sheet: ExcelSheetSpec): Promise<Blob> {
  const { data } = await api.post<Blob>(
    excelApiRoutes.template,
    { sheet },
    { responseType: "blob" },
  );
  return data;
}

export async function uploadExcelParse(
  file: File,
  sheet: ExcelSheetSpec,
  label: string,
): Promise<{ jobId: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("sheet", JSON.stringify(sheet));
  form.append("label", label);
  const { data } = await api.post<{ jobId: string }>(
    excelApiRoutes.parse,
    form,
    multipartRequestConfig(),
  );
  return data;
}

export async function fetchExcelDownload(id: string): Promise<Blob> {
  const { data } = await api.get<Blob>(excelApiRoutes.download(id), {
    responseType: "blob",
  });
  return data;
}

/** Absolute URL of a kernel route, for the stream reader that bypasses the axios client. */
export function excelApiUrl(path: string): string {
  return `${api.defaults.baseURL ?? ""}${path}`;
}
