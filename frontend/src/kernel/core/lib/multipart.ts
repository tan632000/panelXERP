export function multipartRequestConfig() {
  return {
    headers: {
      "Content-Type": undefined as undefined,
    },
  };
}

/**
 * One JSON part plus any number of file parts. A field may carry several files, which are
 * appended under the same name so the server receives them as a collection.
 */
export function buildJsonMultipart(
  payload: unknown,
  files: Record<string, File | Blob | readonly File[] | undefined>,
): FormData {
  const formData = new FormData();
  formData.append("data", JSON.stringify(payload));

  for (const [field, value] of Object.entries(files)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const file of value) formData.append(field, file);
      continue;
    }
    formData.append(field, value as File | Blob);
  }

  return formData;
}
