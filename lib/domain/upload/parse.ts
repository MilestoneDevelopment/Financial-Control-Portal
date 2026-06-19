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
