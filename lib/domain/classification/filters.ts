/**
 * Pure helpers for the Classification Review filter bar (no DB - testable).
 */
export interface ClassificationFilters {
  fileId: string;
  status: string;
  currency: string;
  dateFrom: string;
  dateTo: string;
  search: string;
}

export const EMPTY_FILTERS: ClassificationFilters = {
  fileId: "",
  status: "",
  currency: "",
  dateFrom: "",
  dateTo: "",
  search: "",
};

/** Only non-empty filters become query params (so a reset yields a clean URL). */
export function buildFilterParams(f: ClassificationFilters): Record<string, string> {
  const out: Record<string, string> = {};
  (Object.keys(f) as (keyof ClassificationFilters)[]).forEach((k) => {
    const v = f[k];
    if (v) out[k] = v;
  });
  return out;
}

export function hasAnyFilter(f: ClassificationFilters): boolean {
  return Object.values(f).some((v) => v !== "");
}

/**
 * Client-side live-search match: case-insensitive substring over the given parts
 * (e.g. description / debit / credit). Empty query matches everything. Georgian
 * text is preserved (toLowerCase is a no-op for caseless scripts).
 */
export function matchesSearch(parts: (string | null | undefined)[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return parts.some((p) => (p ?? "").toLowerCase().includes(q));
}
