# Frontend templates

Copy-paste skeletons for every frontend file of a CRUD feature. Placeholders are defined in
[`runbook.md`](runbook.md).

Reference implementation:
`frontend/src/plugins/master-data/surface-treatment-material/`.

---

## `constants.ts`

Everything a screen would otherwise hard-code.

```ts
import { BYTES_PER_MB } from "@/kernel/core/constants/file-size";

/** Business code prefix — codes read `XX_0001`. */
export const <FEATURE>_CODE_PREFIX = "XX_";

export const <featureCamel>PageRoutes = {
  list: "/<plugin>/<feature>",
  detail: (id: number | string) => `/<plugin>/<feature>/${id}`,
} as const;

export const <featureCamel>ApiRoutes = {
  list: "/<features>",
  bulkDelete: "/<features>/bulk-delete",
  columnValues: "/<features>/column-values",
  nextCode: "/<features>/next-code",
  detail: (id: number | string) => `/<features>/${id}`,
  canDelete: (id: number | string) => `/<features>/${id}/can-delete`,
} as const;

/** Module key the list-preference endpoint stores this list's column choice under. */
export const <FEATURE>_LIST_PREFERENCE_KEY = "<feature_key>_list";

export const <featureCamel>QueryKeys = {
  all: ["<features>"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...<featureCamel>QueryKeys.all, "list", filters] as const,
  detail: (id: number | string) => [...<featureCamel>QueryKeys.all, id] as const,
  nextCode: () => [...<featureCamel>QueryKeys.all, "next-code"] as const,
};

/** Enum members + badge colours. Labels come from i18n, never from here. */
export const <FEATURE>_<AXIS>_ITEMS = [
  { value: "memberOne", colorClass: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "memberTwo", colorClass: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "other", colorClass: "bg-slate-50 text-slate-700 border-slate-200" },
] as const;

export type <Feature><Axis> = (typeof <FEATURE>_<AXIS>_ITEMS)[number]["value"];

export const <FEATURE>_<AXIS>S = <FEATURE>_<AXIS>_ITEMS.map(
  (item) => item.value,
) as unknown as readonly [<Feature><Axis>, ...<Feature><Axis>[]];

export const <FEATURE>_<AXIS>_BY_VALUE = Object.fromEntries(
  <FEATURE>_<AXIS>_ITEMS.map((item) => [item.value, item]),
) as Record<<Feature><Axis>, (typeof <FEATURE>_<AXIS>_ITEMS)[number]>;

// only for features with file uploads
export const <FEATURE>_ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".xlsx"] as const;
export const <FEATURE>_FILE_ACCEPT = <FEATURE>_ALLOWED_EXTENSIONS.join(",");
export const <FEATURE>_MAX_FILE_BYTES = 20 * BYTES_PER_MB;
```

---

## `types.ts`

```ts
import type { <Feature><Axis> } from "@plugins/<plugin>/<feature>/constants";

export interface <Feature> {
  id: number;
  code: string;
  name: string;
  <axis>: <Feature><Axis>;
  manufacturer?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: number | null;
  updatedBy?: number | null;
}

export interface <Feature>ListParams {
  page?: number;
  limit?: number;
  search?: string;
  <axis>?: <Feature><Axis>;
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
  /** JSON map of column key to selected values, from the table's column filters. */
  columnFilters?: string;
}

export interface Create<Feature>Dto {
  code: string;
  name: string;
  <axis>: <Feature><Axis>;
  manufacturer?: string;
  notes?: string;
}

export type Update<Feature>Dto = Partial<Create<Feature>Dto>;

export interface <Feature>NextCode { code: string }
export interface <Feature>CanDeleteResponse { canDelete: boolean }
```

---

## `permissions/<feature>.permissions.ts` and `<feature>-permission.keys.ts`

```ts
// <feature>.permissions.ts — mirrors the backend constants
export const <FEATURE>_READ = "<feature_key>:read" as const;
export const <FEATURE>_WRITE = "<feature_key>:write" as const;
export const <FEATURE>_DELETE = "<feature_key>:delete" as const;

export const <featureCamel>Permissions = [
  <FEATURE>_READ,
  <FEATURE>_WRITE,
  <FEATURE>_DELETE,
] as const;
```

```ts
// <feature>-permission.keys.ts
/**
 * <Feature> permission keys — keep in sync with backend <feature>.permissions.ts.
 *
 * Gate every <feature> control on one of these instead of a literal string, so a scope rename
 * shows up as a type error rather than a control that silently stops matching.
 */
export const <Feature>Permission = {
  read: "<feature_key>:read",
  write: "<feature_key>:write",
  delete: "<feature_key>:delete",
} as const;

export type <Feature>PermissionKey =
  (typeof <Feature>Permission)[keyof typeof <Feature>Permission];
```

---

## `<feature>.feature.ts`

```ts
import type { ErpFrontendFeature } from "@/kernel/platform/features/feature.contract";

export const <featureCamel>Feature: ErpFrontendFeature = {
  key: "<feature>",
  plugin: "<plugin>",
  sectionTitle: "sectionMasterData",
  items: [
    {
      featureKey: "<feature>",
      href: "/<plugin>/<feature>",
      icon: "<tabler-icon-name>",
      label: "<featureCamel>",
      permissions: ["<feature_key>:read", "<feature_key>:*"],
    },
  ],
};
```

---

## `services/<feature>.service.ts`

One plain async function per endpoint.

```ts
import api from "@/kernel/core/api/api";
import { requestBulkDelete } from "@/kernel/core/api/bulk-delete";

import { <featureCamel>ApiRoutes } from "@plugins/<plugin>/<feature>/constants";

import type { BulkDeleteResult } from "@/kernel/core/types/bulk-delete";
import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  <Feature>, <Feature>ListParams, <Feature>NextCode,
  <Feature>CanDeleteResponse, Create<Feature>Dto, Update<Feature>Dto,
} from "@plugins/<plugin>/<feature>/types";

export async function get<Feature>s(
  params: <Feature>ListParams = {},
): Promise<PaginatedResponse<<Feature>>> {
  const { data } = await api.get<PaginatedResponse<<Feature>>>(
    <featureCamel>ApiRoutes.list, { params },
  );
  return data;
}

export async function get<Feature>(id: number): Promise<<Feature>> {
  const { data } = await api.get<<Feature>>(<featureCamel>ApiRoutes.detail(id));
  return data;
}

export async function getNext<Feature>Code(): Promise<<Feature>NextCode> {
  const { data } = await api.get<<Feature>NextCode>(<featureCamel>ApiRoutes.nextCode);
  return data;
}

export async function canDelete<Feature>(id: number): Promise<<Feature>CanDeleteResponse> {
  const { data } = await api.get<<Feature>CanDeleteResponse>(
    <featureCamel>ApiRoutes.canDelete(id),
  );
  return data;
}

export async function create<Feature>(payload: Create<Feature>Dto): Promise<<Feature>> {
  const { data } = await api.post<<Feature>>(<featureCamel>ApiRoutes.list, payload);
  return data;
}

export async function update<Feature>(
  id: number, payload: Update<Feature>Dto,
): Promise<<Feature>> {
  const { data } = await api.patch<<Feature>>(<featureCamel>ApiRoutes.detail(id), payload);
  return data;
}

export async function delete<Feature>(id: number): Promise<void> {
  await api.delete(<featureCamel>ApiRoutes.detail(id));
}

export function bulkDelete<Feature>s(ids: number[]): Promise<BulkDeleteResult> {
  return requestBulkDelete(<featureCamel>ApiRoutes.bulkDelete, ids);
}
```

**File uploads:** switch to multipart only when a file or a `remove*` flag is present —
`buildJsonMultipart(payload, { doc: options.docFile })` + `multipartRequestConfig()`. Otherwise
send plain JSON.

---

## `hooks/api/use<Feature>.ts`

```ts
"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";
import { useBulkDeleteMutation, type BulkDeleteHookOptions } from "@/kernel/core/hooks/api/useBulkDeleteMutation";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";
import { useToastMutationFeedback } from "@/kernel/core/hooks/useToastMutationFeedback";

import { <featureCamel>QueryKeys } from "@plugins/<plugin>/<feature>/constants";
import { /* … service functions … */ } from "@plugins/<plugin>/<feature>/services/<feature>.service";
import { resolve<Feature>DeleteToastKey } from "@plugins/<plugin>/<feature>/utils/map-<feature>-api-errors";

export function use<Feature>List(params: <Feature>ListParams = {}) {
  return useQuery({
    queryKey: <featureCamel>QueryKeys.list(params as Record<string, unknown>),
    queryFn: () => get<Feature>s(params),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function use<Feature>(id?: number | null) {
  return useQuery({
    queryKey: <featureCamel>QueryKeys.detail(id ?? 0),
    queryFn: () => get<Feature>(id as number),
    enabled: Boolean(id),
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function useNext<Feature>Code(enabled = true) {
  return useQuery({
    queryKey: <featureCamel>QueryKeys.nextCode(),
    queryFn: getNext<Feature>Code,
    enabled,
    staleTime: DEFAULT_LIST_STALE_MS,
  });
}

export function useCreate<Feature>() {
  const t = useTranslations("<featureCamel>.toast");
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback("<featureCamel>.toast");
  return useMutationFeedback({
    mutationFn: (payload: Create<Feature>Dto) => create<Feature>(payload),
    successMessage: t("createSuccess"),
    ...feedback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: <featureCamel>QueryKeys.all });
    },
  });
}

export function useUpdate<Feature>() {
  const t = useTranslations("<featureCamel>.toast");
  const qc = useQueryClient();
  const feedback = useToastMutationFeedback("<featureCamel>.toast");
  return useMutationFeedback({
    mutationFn: ({ id, payload }: { id: number; payload: Update<Feature>Dto }) =>
      update<Feature>(id, payload),
    successMessage: t("updateSuccess"),
    ...feedback,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: <featureCamel>QueryKeys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: <featureCamel>QueryKeys.all });
    },
  });
}

export function useBulkDelete<Feature>s(options: BulkDeleteHookOptions = {}) {
  return useBulkDeleteMutation({
    mutationFn: bulkDelete<Feature>s,
    queryKey: <featureCamel>QueryKeys.all,
    toastNamespace: "<featureCamel>.toast",
    ...options,
  });
}
```

---

## `schemas/<feature>.schema.ts`

Messages are injected, never hard-coded — that is what keeps validation localized.

The `code` field is auto-suggested from `<FEATURE>_CODE_PREFIX` when the create modal opens and
stays **editable** — validate it with `masterDataCodeSchema` exactly as a hand-typed value, and
always include it in the payload. Never render it disabled or read-only.

The schema carries only user-entered business fields. Audit columns — `createdAt` ("Ngày tạo"),
`updatedAt`, `createdBy`, `updatedBy` — never appear here, in `FormFields` or in the create/edit
payload, even when the mock's modal draws a created-date input.

```ts
import { z } from "zod";

import { masterDataCodeSchema } from "@/kernel/core/lib/master-data-code";
import { optionalMaxString } from "@/kernel/core/lib/validators";

import { <FEATURE>_CODE_PREFIX, <FEATURE>_<AXIS>S } from "@plugins/<plugin>/<feature>/constants";

export interface <Feature>ValidationMessages {
  codeRequired: string;
  codeMax: string;
  codePrefix: string;
  nameRequired: string;
  nameMax: string;
  <axis>Required: string;
  manufacturerMax: string;
  notesMax: string;
}

export function create<Feature>Schema(messages: <Feature>ValidationMessages) {
  const <axis>Enum = z.enum(<FEATURE>_<AXIS>S);

  return z.object({
    code: masterDataCodeSchema({
      prefix: <FEATURE>_CODE_PREFIX,
      maxLength: 30,
      messages: {
        required: messages.codeRequired,
        max: messages.codeMax,
        prefix: messages.codePrefix,
      },
    }),
    name: z.string().trim().min(1, messages.nameRequired).max(255, messages.nameMax),
    <axis>: z
      .union([<axis>Enum, z.literal("")])
      .refine((value) => value !== "", { message: messages.<axis>Required }),
    manufacturer: optionalMaxString(255, messages.manufacturerMax),
    notes: optionalMaxString(2000, messages.notesMax),
  });
}

export type <Feature>FormInput = z.input<ReturnType<typeof create<Feature>Schema>>;
export type Create<Feature>FormValues = z.output<ReturnType<typeof create<Feature>Schema>>;
```

---

## `hooks/use<Feature>FormSchema.ts` and `hooks/use<Feature><Axis>s.ts`

```ts
"use client";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { create<Feature>Schema } from "@plugins/<plugin>/<feature>/schemas/<feature>.schema";

export function use<Feature>FormSchema() {
  const t = useTranslations("<featureCamel>.validation");
  const schema = useMemo(
    () => create<Feature>Schema({
      codeRequired: t("codeRequired"),
      codeMax: t("codeMax"),
      codePrefix: t("codePrefix"),
      nameRequired: t("nameRequired"),
      nameMax: t("nameMax"),
      <axis>Required: t("<axis>Required"),
      manufacturerMax: t("manufacturerMax"),
      notesMax: t("notesMax"),
    }),
    [t],
  );
  return { schema, tValidation: t };
}
```

```ts
"use client";
import { useClassificationOptions } from "@/kernel/core/hooks/useClassificationOptions";

import {
  <FEATURE>_<AXIS>_BY_VALUE,
  <FEATURE>_<AXIS>_ITEMS,
} from "@plugins/<plugin>/<feature>/constants";

import type { <Feature><Axis> } from "@plugins/<plugin>/<feature>/constants";

export function use<Feature><Axis>s() {
  return useClassificationOptions<<Feature><Axis>>(
    "<featureCamel>.categories",
    <FEATURE>_<AXIS>_ITEMS,
    <FEATURE>_<AXIS>_BY_VALUE,
  );
}
```

---

## `utils/form-payload.ts`

Three converters. Note the create/update asymmetry: create omits empty optionals,
**update sends them explicitly so a field can be cleared**.

```ts
import { optionalTrimmedField, trimFormField } from "@/kernel/core/lib/form-payload";

export function to<Feature>FormValues(item: <Feature>): <Feature>FormInput {
  return {
    code: item.code,
    name: item.name ?? "",
    <axis>: item.<axis>,
    manufacturer: item.manufacturer ?? "",
    notes: item.notes ?? "",
  };
}

export function to<Feature>CreatePayload(data: Create<Feature>FormValues): Create<Feature>Dto {
  return {
    code: data.code.trim(),
    name: data.name.trim(),
    <axis>: data.<axis>,
    manufacturer: optionalTrimmedField(data.manufacturer),   // undefined when empty
    notes: optionalTrimmedField(data.notes),
  };
}

/** Full-form update: always send clearable text fields explicitly. */
export function to<Feature>UpdatePayload(data: Create<Feature>FormValues): Update<Feature>Dto {
  return {
    code: data.code.trim(),
    name: data.name.trim(),
    <axis>: data.<axis>,
    manufacturer: trimFormField(data.manufacturer),          // "" when cleared
    notes: trimFormField(data.notes),
  };
}
```

---

## `utils/map-<feature>-api-errors.ts`

Maps backend messages onto form fields and delete-failure toasts.

```ts
import { isAxiosError } from "axios";

import {
  applyKeywordFieldMatchers,
  isDuplicateConflictError,
  resolveToastKeyByKeywords,
} from "@/kernel/core/lib/api-error-mapping";
import { applyApiFieldErrors, extractApiErrorMessage, type FieldErrorSetter } from "@/kernel/core/lib/errors";

type <Feature>DeleteToastKey = "deleteInUseDocument";

const FIELD_MATCHERS = [
  [["name"], "name"],
  [["code"], "code"],
  [["<axis>"], "<axis>"],
  [["notes"], "notes"],
] as const;

const DELETE_TOAST_RULES = [
  [["cannot delete", "referenced", "document"], "deleteInUseDocument"],
] as const;

export function map<Feature>ApiErrorsToForm(
  error: unknown,
  setFieldError: FieldErrorSetter,
  messages: { nameExists: string; codeExists: string },
): boolean {
  const { data, mapped } = applyApiFieldErrors(error, setFieldError);
  if (!isAxiosError(error)) return false;

  const apiMessage = extractApiErrorMessage(data);
  if (!apiMessage) return mapped;
  const lower = apiMessage.toLowerCase();

  if (isDuplicateConflictError(error.response?.status, lower)) {
    setFieldError(
      lower.includes("code") ? "code" : "name",
      lower.includes("code") ? messages.codeExists : messages.nameExists,
    );
    return true;
  }

  if (applyKeywordFieldMatchers(lower, apiMessage, setFieldError, FIELD_MATCHERS)) return true;
  return mapped;
}

export function resolve<Feature>DeleteToastKey(error: unknown): <Feature>DeleteToastKey | null {
  return resolveToastKeyByKeywords(error, DELETE_TOAST_RULES) as <Feature>DeleteToastKey | null;
}
```

The `isDuplicateConflictError` branch is **not optional**, and it belongs to whichever field
holds the code — `code` here, but `prId`, `poNo` or `rfqCode` in a transaction feature. Dropping
it, or routing every conflict to `name`, is the one deviation from this template that fails
**silently**: `shouldSuppressInlineFormErrorToast` already withholds the toast for a message
naming a taken value, on the understanding that the form shows it inline instead. So a mapper
with no rule for the code produces no toast *and* no field error — the user presses Save, the
record is not written, and nothing at all appears on screen.

That is exactly what a concurrent create hits. Two actors open the form, are auto-suggested the
same ordinal from the highest code in use, and the second to save collides. Ship it with the
mapper unit test from §3.7 (`tests/map-<feature>-api-errors.test.ts`):

```ts
it("should show a code collision on the code input", () => {
  const setFieldError = vi.fn();

  map<Feature>ApiErrorsToForm(
    axiosErrorWithMessage("<Feature> code already exists.", 409),
    setFieldError,
    messages,
  );

  expect(setFieldError).toHaveBeenCalledWith("code", messages.codeExists);
});
```

Also keep the message localized. `setFieldError("<codeField>", apiMessage)` puts the server's
English sentence under a Vietnamese label; pass `messages.codeExists` instead, and word it so it
names the correction the user has to make ("Vui lòng sửa lại số thứ tự").

---

## `components/Create<Feature>Modal.tsx`

The Edit modal is the same shape, seeded from `to<Feature>FormValues(item)` and calling
`to<Feature>UpdatePayload`.

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import React, { useEffect } from "react";
import { useForm, type Resolver } from "react-hook-form";

import { Modal } from "@/kernel/core/components/ui/Modal";

import { useCreate<Feature>, useNext<Feature>Code } from "@plugins/<plugin>/<feature>/hooks/api/use<Feature>";
import { use<Feature>FormSchema } from "@plugins/<plugin>/<feature>/hooks/use<Feature>FormSchema";
import { to<Feature>CreatePayload } from "@plugins/<plugin>/<feature>/utils/form-payload";
import { map<Feature>ApiErrorsToForm } from "@plugins/<plugin>/<feature>/utils/map-<feature>-api-errors";

import { <Feature>FormFields } from "./<Feature>FormFields";

import type { Create<Feature>FormValues, <Feature>FormInput } from "@plugins/<plugin>/<feature>/schemas/<feature>.schema";

const EMPTY_FORM = {
  code: "",
  name: "",
  <axis>: "",
  manufacturer: "",
  notes: "",
} satisfies <Feature>FormInput;

interface Create<Feature>ModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Create<Feature>Modal({ isOpen, onClose }: Create<Feature>ModalProps) {
  const tModal = useTranslations("modal");
  const tCommon = useTranslations("common");
  const { schema, tValidation } = use<Feature>FormSchema();
  const createMutation = useCreate<Feature>();
  const nextCodeQuery = useNext<Feature>Code(isOpen);

  const form = useForm<<Feature>FormInput>({
    resolver: zodResolver(schema) as Resolver<<Feature>FormInput>,
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: EMPTY_FORM,
  });

  useEffect(() => {
    if (!isOpen) return;
    form.reset({ ...EMPTY_FORM, code: nextCodeQuery.data?.code ?? "" });
  }, [isOpen, nextCodeQuery.data?.code, form]);

  const handleSave = async (data: <Feature>FormInput) => {
    try {
      const parsed = data as Create<Feature>FormValues;
      await createMutation.mutateAsync(to<Feature>CreatePayload(parsed));
      form.reset();
      onClose();
    } catch (error: unknown) {
      map<Feature>ApiErrorsToForm(
        error,
        (field, message) => form.setError(field as keyof <Feature>FormInput, { message }),
        { nameExists: tValidation("nameExists"), codeExists: tValidation("codeExists") },
      );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={tModal("titles.<featureCamel>")}
      onSubmit={form.handleSubmit(handleSave)}
      submitLabel={tCommon("save")}
      cancelLabel={tCommon("cancel")}
      wide
    >
      <<Feature>FormFields form={form} />
    </Modal>
  );
}
```

---

## `components/<Feature>ListPage.tsx` — required wiring

Do not invent state management; this is the shape every list uses.

```tsx
const t = useTranslations("<featureCamel>");
const { can } = useAuth();
const router = useRouter();
const canWrite = can(<Feature>Permission.write);

const [<axis>Filter, set<Axis>Filter] = useState("all");
const debounced<Axis>Filter = useDebouncedValue(<axis>Filter, { onDebounced: () => setCurrentPage(1) });
const [currentPage, setCurrentPage] = useState(1);
const { searchQuery, setSearchQuery, committedSearch, handleSearchKeyDown } =
  useCommittedSearch({ onCommit: () => setCurrentPage(1) });
const columnFilters = useTableColumnFilters({ onChange: () => setCurrentPage(1) });
const selection = useBulkSelection();

const params = useMemo(() => ({
  page: currentPage,
  limit: DEFAULT_LIST_PAGE_SIZE,
  search: omitEmptySearch(committedSearch),
  <axis>: omitAllFilter(debounced<Axis>Filter) as <Feature><Axis> | undefined,
  columnFilters: columnFilters.param,
}), [currentPage, committedSearch, debounced<Axis>Filter, columnFilters.param]);

const { data: listData, isLoading, isError } = use<Feature>List(params);
const deleteMutation = useDelete<Feature>();
const bulkDelete = useBulkDelete<Feature>s({ onDeleted: selection.deselect });
const failureReason = useDeleteFailureReason("<featureCamel>.toast", resolve<Feature>DeleteToastKey);
useQueryErrorToast(isError, tToast("systemError"));

const items = listData?.data ?? [];
const rowLabels = useRowLabels(items, (row) => [row.id, row.code]);
const { totalItems, totalPages, startIndex, endIndex } = computePaginationMeta({
  page: currentPage,
  pageSize: DEFAULT_LIST_PAGE_SIZE,
  totalItems: listData?.meta?.total ?? 0,
  totalPages: listData?.meta?.totalPages,
  currentPageItemCount: items.length,
});

const hasActiveFilters = Boolean(
  committedSearch || omitAllFilter(debounced<Axis>Filter) || columnFilters.activeCount > 0,
);

// delete always checks the guard first
const handleRequestDelete = useCallback(async (item: <Feature>) => {
  const { canDelete } = await canDelete<Feature>(item.id);
  if (!canDelete) { toast.error(failureReason(...)); return; }
  deleteConfirmation.request(item);
}, [/* … */]);
```

Render with `ListPageLayout` + `ListToolbar` + `ListQueryBody`, and gate the create button with
`PermissionGate`.

---

## `components/<Feature>Table.tsx` — required props

```tsx
export interface <Feature>TableProps extends TableColumnFilterHostProps {
  data: <Feature>[];
  selectedKeys: string[];
  onSelectionChange: (keys: string[]) => void;
  /** Shown in the table selection bar while at least one row is ticked. */
  selectionActions?: React.ReactNode;
  onRowClick: (item: <Feature>) => void;
  onEdit: (item: <Feature>) => void;
  onDelete: (item: <Feature>) => void;
  emptyText?: string;
}
```

```tsx
<Table
  columns={columns}
  columnPreferenceKey={<FEATURE>_LIST_PREFERENCE_KEY}
  columnValuesEndpoint={<featureCamel>ApiRoutes.columnValues}
  columnFilters={columnFilters}
  onColumnFiltersChange={onColumnFiltersChange}
  /* … */
/>
```

Column order and labels come from the mock. Enum cells use `ClassificationBadge` with the
`colorClass` from the items array. No eye icon — the row click opens the detail.

---

## Route files

```tsx
// app/[locale]/<plugin>/<feature>/page.tsx
"use client";
import { <Feature>ListPage } from "@/plugins/<plugin>/<feature>/components/<Feature>ListPage";

export default function <Feature>Page() {
  return <<Feature>ListPage />;
}
```

```tsx
// app/[locale]/<plugin>/<feature>/[id]/page.tsx
"use client";
import { <Feature>DetailPage } from "@/plugins/<plugin>/<feature>/components/<Feature>DetailPage";

export default function <Feature>DetailRoutePage() {
  return <<Feature>DetailPage />;
}
```

Detail pages use `useEntityIdParam`, `DetailPageLayout`, `DetailPanelActions`, `LoadingState`,
`EmptyState` + `isNotFoundError`, and a breadcrumb back to the list — **no back button**.
`DetailPanelActions` buttons are **icon-only** (label via `aria-label`/tooltip, from i18n); add
visible text only when an input explicitly requires it.
