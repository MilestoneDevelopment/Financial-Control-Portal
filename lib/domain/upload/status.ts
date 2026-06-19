/**
 * Pure upload/import lifecycle logic (no server/DB imports - testable).
 *
 * Import:     uploaded -> parsing -> parsed -> imported   (failed reachable from
 *             parsing/parsed). Validation is tracked separately.
 * Validation: pending -> passed | warnings | failed.
 */
import type { Database } from "@/db/types";

export type ImportStatus = Database["public"]["Enums"]["import_status"];
export type ValidationStatus = Database["public"]["Enums"]["upload_validation_status"];
export type IssueSeverity = Database["public"]["Enums"]["upload_issue_severity"];
export type FxStatus = Database["public"]["Enums"]["fx_status"];
export type TxClassificationStatus = Database["public"]["Enums"]["tx_classification_status"];

export const FX_STATUS_LABEL: Record<FxStatus, string> = {
  not_required: "Not required",
  pending: "Pending",
  resolved: "Resolved",
  manual: "Manual",
};

export const IMPORT_STATUS_LABEL: Record<ImportStatus, string> = {
  uploaded: "Uploaded",
  parsing: "Parsing",
  parsed: "Parsed",
  imported: "Imported",
  failed: "Failed",
};

export const VALIDATION_STATUS_LABEL: Record<ValidationStatus, string> = {
  pending: "Pending",
  passed: "Passed",
  warnings: "Passed with warnings",
  failed: "Failed",
};

/** Allowed import-status transitions. */
export const ALLOWED_IMPORT_TRANSITIONS: Record<ImportStatus, ImportStatus[]> = {
  uploaded: ["parsing", "failed"],
  parsing: ["parsed", "failed"],
  parsed: ["imported", "failed"],
  imported: [],
  failed: ["parsing"], // allow a retry from a failed parse
};

export function canImportTransition(from: ImportStatus, to: ImportStatus): boolean {
  return ALLOWED_IMPORT_TRANSITIONS[from].includes(to);
}

/** A file is still in progress (not a terminal state). */
export function isImportInProgress(s: ImportStatus): boolean {
  return s !== "imported" && s !== "failed";
}

/**
 * Derive a validation status from the collected issues.
 * Any error -> failed; warnings only -> warnings; none -> passed.
 */
export function deriveValidationStatus(
  issues: { severity: IssueSeverity }[],
): ValidationStatus {
  if (issues.some((i) => i.severity === "error")) return "failed";
  if (issues.some((i) => i.severity === "warning")) return "warnings";
  return "passed";
}
