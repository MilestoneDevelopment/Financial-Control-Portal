"use server";

/**
 * Accounting upload server actions (Phase 2A foundation).
 *
 * uploadAccountingFileAction: capability-gated (upload.file), period-aware
 * (requirePeriodMutable when a period is selected), audited. Stores the file in
 * the private `accounting-files` bucket and creates the accounting_files (import
 * batch) record. Actual XLSX parsing into transactions is Phase 2B. RLS and the
 * storage policies independently enforce the same access at the database.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { getCompany } from "@/lib/data/companies";
import { getAccountingFile } from "@/lib/data/uploads";
import { requirePeriodMutable } from "@/lib/domain/period/lifecycle";
import { validateUploadFile, hasBlockingIssue } from "@/lib/domain/upload/parse";
import { buildImport } from "@/lib/domain/upload/import";
import { readXlsxGrid } from "@/lib/server/xlsx";
import type { Database } from "@/db/types";

/** First/last ISO day of a month (or the whole year when month is null). */
function periodRange(year: number, month: number | null): { start: string; end: string } {
  if (!month) return { start: `${year}-01-01`, end: `${year}-12-31` };
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

export async function uploadAccountingFileAction(formData: FormData): Promise<void> {
  const companyId = String(formData.get("companyId") ?? "");
  const periodIdRaw = formData.get("periodId");
  const periodId = periodIdRaw ? String(periodIdRaw) : null;
  const file = formData.get("file");

  if (!companyId) throw new Error("Missing company.");
  if (!(file instanceof File)) throw new Error("No file provided.");

  const supabase = await createClient();
  await requireCapability(supabase, "upload.file", companyId);
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found.");

  // Validate file metadata (extension / size) before touching storage.
  const fileIssues = validateUploadFile({ filename: file.name, size: file.size });
  if (hasBlockingIssue(fileIssues)) {
    throw new Error(fileIssues.find((i) => i.severity === "error")!.message);
  }

  // If a period is selected it must accept writes (locked/closed need Correction Mode).
  let isCorrectionUpload = false;
  let selectedStart: string | null = null;
  let selectedEnd: string | null = null;
  if (periodId) {
    const { data: period } = await supabase
      .from("periods")
      .select("status, is_correction_mode, year, month")
      .eq("id", periodId)
      .maybeSingle();
    if (!period) throw new Error("Selected period not found.");
    requirePeriodMutable({ status: period.status, is_correction_mode: period.is_correction_mode });
    isCorrectionUpload = period.status === "locked" || period.status === "closed";
    const range = periodRange(period.year, period.month);
    selectedStart = range.start;
    selectedEnd = range.end;
  }

  // Store the file: {companyId}/{fileId}/{safeName}. fileId is reused as the
  // accounting_files PK so the row and its object share an id.
  const fileId = crypto.randomUUID();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${companyId}/${fileId}/${safeName}`;
  const { error: upErr } = await supabase.storage
    .from("accounting-files")
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

  const { error: insErr } = await supabase.from("accounting_files").insert({
    id: fileId,
    company_id: companyId,
    period_id: periodId,
    storage_path: path,
    original_filename: file.name,
    file_size: file.size,
    selected_period_start: selectedStart,
    selected_period_end: selectedEnd,
    import_status: "uploaded",
    validation_status: "pending",
    is_correction_upload: isCorrectionUpload,
  });
  if (insErr) {
    // Best-effort: don't leave an orphaned object if the row insert fails.
    await supabase.storage.from("accounting-files").remove([path]);
    throw new Error(insErr.message);
  }

  await logAudit(supabase, {
    orgId: company.org_id,
    companyId,
    action: "accounting.file.uploaded",
    target: file.name,
    details: { fileId, periodId, size: file.size, correction: isCorrectionUpload },
    severity: isCorrectionUpload ? "warn" : "ok",
  });
  revalidatePath(`/c/${companyId}/upload`);
}

/**
 * Parse an uploaded accounting file from Storage and import its rows into
 * `transactions`. Capability-gated, period-aware, audited. Idempotent guard: a
 * file already `imported` cannot be re-imported (we have no DELETE grant, so this
 * prevents duplicate rows). Transactions are inserted in a single atomic insert.
 */
export async function parseAccountingFileAction(fileId: string): Promise<void> {
  const supabase = await createClient();
  const file = await getAccountingFile(fileId);
  if (!file) throw new Error("File not found.");
  const companyId = file.company_id;
  await requireCapability(supabase, "upload.file", companyId);
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found.");

  if (file.import_status === "imported") {
    throw new Error("This file has already been imported.");
  }

  // If bound to a period, it must accept writes (locked/closed need Correction Mode).
  if (file.period_id) {
    const { data: period } = await supabase
      .from("periods")
      .select("status, is_correction_mode")
      .eq("id", file.period_id)
      .maybeSingle();
    if (period) {
      requirePeriodMutable({ status: period.status, is_correction_mode: period.is_correction_mode });
    }
  }

  await supabase
    .from("accounting_files")
    .update({ import_status: "parsing", updated_at: new Date().toISOString() })
    .eq("id", fileId);

  try {
    if (file.original_filename.toLowerCase().endsWith(".xls")) {
      throw new Error("Legacy .xls is not supported — please re-save as .xlsx.");
    }

    const { data: blob, error: dlErr } = await supabase.storage
      .from("accounting-files")
      .download(file.storage_path);
    if (dlErr || !blob) throw new Error(`Could not download file: ${dlErr?.message ?? "no data"}`);
    const buf = Buffer.from(await blob.arrayBuffer());

    const grid = await readXlsxGrid(buf);
    const selected =
      file.selected_period_start && file.selected_period_end
        ? { start: file.selected_period_start, end: file.selected_period_end }
        : null;
    const result = buildImport({
      headers: grid.headers,
      rows: grid.rows,
      baseCurrency: company.base_currency,
      selected,
    });

    // Persist issues first (advisory; safe to re-write on a retry).
    if (result.issues.length) {
      const { error: issErr } = await supabase.from("accounting_file_issues").insert(
        result.issues.map((iss) => ({
          file_id: fileId,
          company_id: companyId,
          row_index: iss.rowIndex,
          severity: iss.severity,
          code: iss.code,
          message: iss.message,
        })),
      );
      if (issErr) throw new Error(`Issue write failed: ${issErr.message}`);
    }

    if (result.blocked) {
      await supabase
        .from("accounting_files")
        .update({
          import_status: "failed",
          validation_status: "failed",
          row_count: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", fileId);
      await logAudit(supabase, {
        orgId: company.org_id,
        companyId,
        action: "accounting.file.parse_failed",
        target: file.original_filename,
        details: { fileId, reason: "missing required columns" },
        severity: "warn",
      });
      revalidatePath(`/c/${companyId}/upload`);
      return; // not an exception: file is recorded as failed with issues to review
    }

    // Single atomic insert (no partial rows on failure -> safe to retry from failed).
    if (result.rows.length) {
      const { error: txErr } = await supabase.from("transactions").insert(
        result.rows.map((r) => ({
          company_id: companyId,
          file_id: fileId,
          period_id: file.period_id,
          row_index: r.rowIndex,
          transaction_date: r.transactionDate,
          document_ref: r.documentRef,
          reference: r.reference,
          description: r.description,
          comment: r.comment,
          debit_account: r.debitAccount,
          credit_account: r.creditAccount,
          debit_amount: r.debitAmount,
          credit_amount: r.creditAmount,
          original_amount: r.originalAmount,
          original_currency: r.originalCurrency,
          fx_rate_to_gel: r.fxRateToGel,
          fx_rate_source: r.fxRateSource,
          fx_rate_date: r.fxRateDate,
          fx_status: r.fxStatus,
          amount_gel: r.amountGel,
          classification_status: "unclassified" as const,
          class_id: null,
          raw_row_json: r.rawRow as Database["public"]["Tables"]["transactions"]["Insert"]["raw_row_json"],
        })),
      );
      if (txErr) throw new Error(`Transaction insert failed: ${txErr.message}`);
    }

    await supabase
      .from("accounting_files")
      .update({
        import_status: "imported",
        validation_status: result.validationStatus,
        row_count: result.rowCount,
        detected_period_start: result.detectedStart,
        detected_period_end: result.detectedEnd,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fileId);

    await logAudit(supabase, {
      orgId: company.org_id,
      companyId,
      action: "accounting.file.imported",
      target: file.original_filename,
      details: {
        fileId,
        rowCount: result.rowCount,
        issues: result.issues.length,
        validation: result.validationStatus,
      },
      severity: result.validationStatus === "warnings" ? "warn" : "ok",
    });
    revalidatePath(`/c/${companyId}/upload`);
  } catch (e) {
    await supabase
      .from("accounting_files")
      .update({ import_status: "failed", updated_at: new Date().toISOString() })
      .eq("id", fileId);
    await logAudit(supabase, {
      orgId: company.org_id,
      companyId,
      action: "accounting.file.parse_failed",
      target: file.original_filename,
      details: { fileId, error: e instanceof Error ? e.message : String(e) },
      severity: "warn",
    });
    revalidatePath(`/c/${companyId}/upload`);
    throw e instanceof Error ? e : new Error(String(e));
  }
}
