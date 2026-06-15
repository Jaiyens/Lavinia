import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class lists with conditional logic. `clsx` resolves the
 * conditionals; `twMerge` dedupes conflicting utilities so the last one wins.
 * Use this for every dynamic className instead of string concatenation.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
