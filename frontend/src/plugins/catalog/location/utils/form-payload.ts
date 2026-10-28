import {
  optionalTrimmedField,
  trimFormField,
} from "@/kernel/core/lib/form-payload";

import type {
  LocationFormInput,
  LocationFormValues,
} from "@plugins/catalog/location/schemas/location.schema";
import type {
  CreateLocationDto,
  Location,
  UpdateLocationDto,
} from "@plugins/catalog/location/types";

export const EMPTY_LOCATION_FORM = {
  code: "",
  name: "",
  note: "",
  isActive: true,
} satisfies LocationFormInput;

export function toLocationFormValues(location: Location): LocationFormInput {
  return {
    code: location.code,
    name: location.name ?? "",
    note: location.note ?? "",
    isActive: location.isActive,
  };
}

/** Create omits the empty optional fields. */
export function toLocationCreatePayload(
  data: LocationFormValues,
): CreateLocationDto {
  return {
    code: data.code.trim(),
    name: data.name.trim(),
    note: optionalTrimmedField(data.note),
    isActive: data.isActive,
  };
}

/** Full-form update: always send the clearable note explicitly. */
export function toLocationUpdatePayload(
  data: LocationFormValues,
): UpdateLocationDto {
  return {
    code: data.code.trim(),
    name: data.name.trim(),
    note: trimFormField(data.note),
    isActive: data.isActive,
  };
}
