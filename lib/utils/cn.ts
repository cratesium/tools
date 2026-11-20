/** Tiny className joiner (no dependency). Falsy values are dropped. */
export function cn(...classes: Array<string | false | null | undefined | 0>): string {
  return classes.filter(Boolean).join(" ");
}
