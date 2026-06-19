/**
 * Pure parsing / validation helpers for accounting uploads (no server/DB imports).
 * Covers: accounting number parsing, FX status classification, period-mismatch
 * detection, and file-metadata validation. XLSX parsing itself is Phase 2B.
 */
import type { Currency } from "./columns.ts";
import type { FxStatus } from "./status.ts";

/** Max upload size (bytes). Accounting monthly exports are well under this. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB
export const ALLOWED_EXTENSIONS = [".xlsx", ".xls"] as const;

export interface UploadIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
}

/**
 * Parse an accounting-formatted number into a JS number, or null if blank/invalid.
 * Handles: thousands separators, currency symbols, surrounding spaces, a leading
 * minus, and accounting parentheses for negatives — e.g. "(1,250.50)" -> -1250.5.
 */
export function parseAccountingNumber(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;

  let s = String(input).trim();
  if (s === "" || s === "-" || s === "—" || s === "–") return null;

  // Accounting parentheses => negative.
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1).trim();
  }

  // Strip currency symbols and whitespace (incl. non-breaking spaces used as
  // thousands separators in some locales), then thousands commas.
  s = s.replace(/[₾$€\s ]/g, "").replace(/,/g, "");

  if (!/^\d*\.?\d+$/.test(s) && !/^\d+\.?\d*$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/**
 * Decide the FX resolution status for a transaction given its original currency
 * and the company's base currency.
 *   - unknown currency        -> pending (needs resolution)
 *   - same as base currency   -> not_required
 *   - different currency      -> pending (rate lookup happens in a later phase)
 */
export function classifyFxStatus(
  originalCurrency: Currency | null,
  baseCurrency: Currency,
): FxStatus {
  if (!originalCurrency) return "pending";
  return originalCurrency === baseCurrency ? "not_required" : "pending";
}

/** True if an ISO date falls within [start, end] inclusive (all ISO yyyy-mm-dd). */
export function dateWithinSelected(dateIso: string, startIso: string, endIso: string): boolean {
  return dateIso >= startIso && dateIso <= endIso;
}

/**
 * Detect a period mismatch between the uploader's selected range and the range
 * detected from the file. Returns true only when both ranges are known and the
 * detected range is not fully contained in the selected range.
 */
export function detectPeriodMismatch(
  selected: { start: string; end: string } | null,
  detected: { start: string; end: string } | null,
): boolean {
  if (!selected || !detected) return false;
  return detected.start < selected.start || detected.end > selected.end;
}

/** Validate file metadata before/independent of parsing. */
export function validateUploadFile(meta: { filename: string; size: number }): UploadIssue[] {
  const issues: UploadIssue[] = [];
  const lower = meta.filename.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    issues.push({
      severity: "error",
      code: "BAD_EXTENSION",
      message: `Unsupported file type. Use an Excel file (${ALLOWED_EXTENSIONS.join(", ")}).`,
    });
  }
  if (meta.size <= 0) {
    issues.push({ severity: "error", code: "EMPTY_FILE", message: "File is empty." });
  }
  if (meta.size > MAX_UPLOAD_BYTES) {
    issues.push({
      severity: "error",
      code: "TOO_LARGE",
      message: `File exceeds the ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB limit.`,
    });
  }
  return issues;
}

/** Whether a set of file-validation issues blocks the upload. */
export function hasBlockingIssue(issues: UploadIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toIso(y: number, m: number, d: number): string | null {
  if (!isValidYmd(y, m, d)) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Parse a date cell into ISO yyyy-mm-dd, or null if blank/unparseable.
 * Handles JS Date (from the XLSX reader), Excel serial numbers, ISO strings, and
 * common dd/mm/yyyy or dd.mm.yyyy (European/Georgian) and yyyy-mm-dd formats.
 * Ambiguous slash dates default to day-first unless the first part is > 12.
 */
export function parseAccountingDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return toIso(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    // Excel serial date: day 1 = 1900-01-01 (epoch 1899-12-30, accounts for the leap bug).
    const ms = Date.UTC(1899, 11, 30) + Math.round(value) * 86400000;
    const dt = new Date(ms);
    return toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  const s = String(value).trim();
  if (s === "") return null;

  // ISO yyyy-mm-dd (optionally with time)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return toIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const parts = s.split(/[./-]/).map((p) => p.trim());
  if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p))) {
    let y: number, m: number, d: number;
    if (parts[0].length === 4) {
      [y, m, d] = [Number(parts[0]), Number(parts[1]), Number(parts[2])];
    } else {
      const a = Number(parts[0]);
      const b = Number(parts[1]);
      y = Number(parts[2]);
      if (y < 100) y += 2000;
      if (a > 12 && b <= 12) [d, m] = [a, b];
      else if (b > 12 && a <= 12) [m, d] = [a, b];
      else [d, m] = [a, b]; // ambiguous -> day-first (European/Georgian)
    }
    return toIso(y, m, d);
  }
  return null;
}

/** Map a currency cell to the supported enum, or null if unknown/blank. */
export function parseCurrency(value: unknown): Currency | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toUpperCase();
  if (s === "") return null;
  if (["GEL", "₾", "LARI", "ლარი", "GEL."].includes(s)) return "GEL";
  if (["USD", "$", "US$", "USD.", "დოლარი"].includes(s)) return "USD";
  if (["EUR", "€", "EUR.", "ევრო"].includes(s)) return "EUR";
  return null;
}
