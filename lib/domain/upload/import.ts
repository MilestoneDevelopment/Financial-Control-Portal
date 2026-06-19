/**
 * Pure accounting-import core (no DB / no XLSX library imports - testable).
 *
 * Takes a header row + a grid of data rows (as produced by the server-only XLSX
 * adapter) and produces normalized transaction rows + validation issues + import
 * metadata. The DB action adds company_id/file_id/period_id and persists. We never
 * invent financial values: when a field is missing or ambiguous we keep the raw
 * row and raise an issue instead of guessing.
 */
import type { Database } from "@/db/types";
import {
  EXPECTED_COLUMNS,
  matchHeader,
  type Currency,
  type TransactionDraft,
} from "./columns.ts";
import {
  parseAccountingNumber,
  parseAccountingDate,
  parseCurrency,
  detectPeriodMismatch,
} from "./parse.ts";
import { deriveValidationStatus, type FxStatus, type ValidationStatus } from "./status.ts";

type FxRateSource = Database["public"]["Enums"]["fx_rate_source"];

export interface ImportIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  rowIndex: number | null; // 1-based data row; null = file-level
}

export interface NormalizedRow {
  rowIndex: number;
  transactionDate: string | null;
  documentRef: string | null;
  reference: string | null;
  description: string | null;
  comment: string | null;
  debitAccount: string | null;
  creditAccount: string | null;
  debitAmount: number | null;
  creditAmount: number | null;
  originalAmount: number | null;
  originalCurrency: Currency | null;
  fxRateToGel: number | null;
  fxRateSource: FxRateSource | null;
  fxRateDate: string | null;
  fxStatus: FxStatus;
  amountGel: number | null;
  rawRow: Record<string, unknown>;
}

export interface ImportResult {
  headerMap: Record<number, keyof TransactionDraft>;
  rows: NormalizedRow[];
  issues: ImportIssue[];
  detectedStart: string | null;
  detectedEnd: string | null;
  rowCount: number;
  validationStatus: ValidationStatus;
  blocked: boolean; // a required column is missing -> nothing imported
}

function cellText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
function isBlank(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildImport(input: {
  headers: unknown[];
  rows: unknown[][];
  baseCurrency: Currency;
  selected: { start: string; end: string } | null;
}): ImportResult {
  const { headers, rows, baseCurrency, selected } = input;

  // Map column index -> known field.
  const headerMap: Record<number, keyof TransactionDraft> = {};
  const mappedFields = new Set<keyof TransactionDraft>();
  headers.forEach((h, idx) => {
    const field = matchHeader(String(h ?? ""));
    if (field) {
      headerMap[idx] = field;
      mappedFields.add(field);
    }
  });

  const issues: ImportIssue[] = [];

  // Required columns must be present.
  const missingRequired = EXPECTED_COLUMNS.filter(
    (c) => c.required && !mappedFields.has(c.field),
  );
  if (missingRequired.length > 0) {
    for (const c of missingRequired) {
      issues.push({
        severity: "error",
        code: "MISSING_COLUMN",
        message: `Required column "${c.label}" was not found in the file.`,
        rowIndex: null,
      });
    }
    return {
      headerMap,
      rows: [],
      issues,
      detectedStart: null,
      detectedEnd: null,
      rowCount: 0,
      validationStatus: "failed",
      blocked: true,
    };
  }

  const currencyMapped = mappedFields.has("originalCurrency");
  const out: NormalizedRow[] = [];
  let rowCount = 0;

  rows.forEach((cells, i) => {
    if (cells.every(isBlank)) return; // skip empty rows
    rowCount += 1;
    const rowIndex = rowCount; // 1-based data row

    // Collect raw cells keyed by header label (traceability).
    const rawRow: Record<string, unknown> = {};
    const byField = new Map<keyof TransactionDraft, unknown>();
    cells.forEach((cell, idx) => {
      const field = headerMap[idx];
      const key = field ?? `col_${idx}`;
      // Keep raw_row_json JSON-safe (Date -> ISO) for traceability.
      rawRow[String(headers[idx] ?? key)] = cell instanceof Date ? cell.toISOString() : cell;
      if (field) byField.set(field, cell);
    });

    const get = (f: keyof TransactionDraft) => byField.get(f);

    // Date (required column present, but a cell may be bad/blank).
    const dateCell = get("transactionDate");
    const transactionDate = parseAccountingDate(dateCell);
    if (!isBlank(dateCell) && transactionDate === null) {
      issues.push({ severity: "warning", code: "BAD_DATE", message: `Unparseable date "${String(dateCell)}".`, rowIndex });
    }

    const numOrIssue = (f: keyof TransactionDraft, code: string): number | null => {
      const c = get(f);
      const n = parseAccountingNumber(c);
      if (!isBlank(c) && n === null) {
        issues.push({ severity: "warning", code, message: `Unparseable amount "${String(c)}" in ${f}.`, rowIndex });
      }
      return n;
    };

    const debitAmount = numOrIssue("debitAmount", "BAD_AMOUNT");
    const creditAmount = numOrIssue("creditAmount", "BAD_AMOUNT");
    const originalAmount = numOrIssue("originalAmount", "BAD_AMOUNT");

    // Currency resolution.
    let originalCurrency: Currency | null;
    const curCell = get("originalCurrency");
    if (!currencyMapped) {
      originalCurrency = baseCurrency; // single-currency file -> assume base
    } else if (isBlank(curCell)) {
      originalCurrency = baseCurrency;
    } else {
      originalCurrency = parseCurrency(curCell);
      if (originalCurrency === null) {
        issues.push({ severity: "warning", code: "BAD_CURRENCY", message: `Unsupported currency "${String(curCell)}".`, rowIndex });
      }
    }

    const fxRate = parseAccountingNumber(get("fxRate"));
    const fxRateDate = parseAccountingDate(get("fxRateDate"));

    // FX status + amount_gel (never invented).
    let fxStatus: FxStatus;
    let fxRateToGel: number | null = null;
    let fxRateSource: FxRateSource | null = null;
    let amountGel: number | null = null;
    if (originalCurrency === null) {
      fxStatus = "pending"; // BAD_CURRENCY already raised
    } else if (originalCurrency === baseCurrency) {
      fxStatus = "not_required";
      amountGel = originalAmount;
    } else if (fxRate !== null && fxRate > 0) {
      fxStatus = "resolved";
      fxRateToGel = fxRate;
      fxRateSource = "imported";
      amountGel = originalAmount !== null ? round2(originalAmount * fxRate) : null;
    } else {
      fxStatus = "pending";
      issues.push({ severity: "warning", code: "MISSING_FX", message: `Missing FX rate for ${originalCurrency} row.`, rowIndex });
    }

    out.push({
      rowIndex,
      transactionDate,
      documentRef: cellText(get("documentRef")),
      reference: cellText(get("reference")),
      description: cellText(get("description")),
      comment: cellText(get("comment")),
      debitAccount: cellText(get("debitAccount")),
      creditAccount: cellText(get("creditAccount")),
      debitAmount,
      creditAmount,
      originalAmount,
      originalCurrency,
      fxRateToGel,
      fxRateSource,
      fxRateDate,
      fxStatus,
      amountGel,
      rawRow,
    });
  });

  // Detected period range from parsed dates.
  const dates = out.map((r) => r.transactionDate).filter((d): d is string => d !== null).sort();
  const detectedStart = dates.length ? dates[0] : null;
  const detectedEnd = dates.length ? dates[dates.length - 1] : null;

  if (selected && detectedStart && detectedEnd) {
    if (detectPeriodMismatch(selected, { start: detectedStart, end: detectedEnd })) {
      issues.push({
        severity: "warning",
        code: "PERIOD_MISMATCH",
        message: `File dates ${detectedStart}…${detectedEnd} fall outside the selected period ${selected.start}…${selected.end}.`,
        rowIndex: null,
      });
    }
  }

  if (rowCount === 0) {
    issues.push({ severity: "warning", code: "NO_DATA_ROWS", message: "No data rows found in the file.", rowIndex: null });
  }

  return {
    headerMap,
    rows: out,
    issues,
    detectedStart,
    detectedEnd,
    rowCount,
    validationStatus: deriveValidationStatus(issues),
    blocked: false,
  };
}
