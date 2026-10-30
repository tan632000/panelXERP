import { twMerge } from "tailwind-merge";

/** Joins classes; a later class replaces an earlier one of the same kind (`w-full` then `w-28`). */
export function cn(...classes: Array<string | false | null | undefined>) {
  return twMerge(...classes);
}
