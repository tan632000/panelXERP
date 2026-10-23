/** Standard unit-of-measure options (aligned with Sales demo HTML `#dvt-opts`). */
export const UNIT_OF_MEASURE_OPTIONS = [
  { value: "pcs", label: "pcs" },
  { value: "kg", label: "kg" },
  { value: "bộ", label: "bộ" },
  { value: "lít", label: "lít" },
  { value: "m", label: "m" },
  { value: "m2", label: "m2" },
  { value: "m3", label: "m3" },
] as const;

export const DEFAULT_UNIT_OF_MEASURE = "pcs";
