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
import { resolveRowFx, fxSourceForDate, type FxLookup } from "@/lib/domain/upload/fx-resolve";
import { missingFxIssuesToClear, shouldRevertSupersede } from "@/lib/domain/upload/issue-cleanup";
import { fetchNbgRate } from "@/lib/server/nbg";
import type { Database } from "@/db/types";

type Currency = Database["public"]["Enums"]["currency"];

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

async function periodMutableGuard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  periodId: string | null,
): Promise<void> {
  if (!periodId) return;
  const { data: period } = await supabase
    .from("periods")
    .select("status, is_correction_mode")
    .eq("id", periodId)
    .maybeSingle();
  if (period) {
    requirePeriodMutable({ status: period.status, is_correction_mode: period.is_correction_mode });
  }
}

/**
 * Resolve pending FX for an imported file's foreign-currency transactions.
 * Priority: existing fx_rates (exact date) -> NBG exact (cached) -> fx_rates/NBG
 * prior date (nbg_prior_filled). Never overwrites already-resolved (imported)
 * rows. Unresolved rows stay `pending` and get a MISSING_FX issue.
 */
export async function resolveFxForFileAction(fileId: string): Promise<void> {
  const supabase = await createClient();
  const file = await getAccountingFile(fileId);
  if (!file) throw new Error("File not found.");
  const companyId = file.company_id;
  await requireCapability(supabase, "upload.file", companyId);
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found.");
  await periodMutableGuard(supabase, file.period_id);

  const { data: pending, error } = await supabase
    .from("transactions")
    .select("id, row_index, transaction_date, original_amount, original_currency")
    .eq("file_id", fileId)
    .eq("fx_status", "pending");
  if (error) throw new Error(error.message);

  const rows = (pending ?? []).filter(
    (r) => r.original_currency && r.original_currency !== company.base_currency,
  );

  let resolved = 0;
  let stillPending = 0;
  const resolvedRowIndexes: number[] = [];
  for (const r of rows) {
    const currency = r.original_currency as Currency;
    const date = r.transaction_date;
    let found: FxLookup | null = null;

    if (date) {
      // 1. fx_rates exact date
      const { data: exact } = await supabase
        .from("fx_rates")
        .select("rate, rate_date, source")
        .eq("quote_currency", currency)
        .eq("rate_date", date)
        .order("source")
        .limit(1)
        .maybeSingle();
      if (exact) found = { rate: Number(exact.rate), date: exact.rate_date, source: exact.source };

      // 2. NBG exact (cache the result)
      if (!found) {
        const nbg = await fetchNbgRate(currency, date);
        if (nbg && nbg.rate > 0) {
          const rateDate = nbg.date || date;
          const source = fxSourceForDate(date, rateDate, "nbg");
          await supabase.rpc("cache_fx_rate", {
            p_currency: currency,
            p_date: rateDate,
            p_rate: nbg.rate,
            p_source: source,
          });
          found = { rate: nbg.rate, date: rateDate, source };
        }
      }

      // 3. fx_rates prior date (nbg_prior_filled)
      if (!found) {
        const { data: prior } = await supabase
          .from("fx_rates")
          .select("rate, rate_date, source")
          .eq("quote_currency", currency)
          .lt("rate_date", date)
          .order("rate_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (prior) found = { rate: Number(prior.rate), date: prior.rate_date, source: "nbg_prior_filled" };
      }
    }

    const res = resolveRowFx({
      currency,
      originalAmount: r.original_amount !== null ? Number(r.original_amount) : null,
      baseCurrency: company.base_currency,
      found,
    });

    if (res.resolved) {
      await supabase
        .from("transactions")
        .update({
          fx_rate_to_gel: res.fxRateToGel,
          fx_rate_source: res.fxRateSource,
          fx_rate_date: res.fxRateDate,
          fx_status: res.fxStatus,
          amount_gel: res.amountGel,
        })
        .eq("id", r.id);
      resolved += 1;
      if (r.row_index !== null) resolvedRowIndexes.push(r.row_index);
    } else {
      stillPending += 1;
      await supabase.from("accounting_file_issues").insert({
        file_id: fileId,
        company_id: companyId,
        row_index: null,
        severity: "warning",
        code: res.issue?.code ?? "MISSING_FX",
        message: res.issue?.message ?? "Missing FX rate.",
      });
    }
  }

  // Mark resolved the parse-time MISSING_FX issues whose rows are now resolved
  // (history is preserved via resolved_at/by/note, not deleted). BAD_CURRENCY stays active.
  let issuesCleared = 0;
  const { data: openIssues } = await supabase
    .from("accounting_file_issues")
    .select("id, code, row_index, resolved_at")
    .eq("file_id", fileId)
    .is("resolved_at", null);
  const toClear = missingFxIssuesToClear(openIssues ?? [], resolvedRowIndexes, stillPending === 0);
  if (toClear.length) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error: clrErr } = await supabase
      .from("accounting_file_issues")
      .update({
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id ?? null,
        resolution_note: "Cleared by FX resolution.",
      })
      .in("id", toClear);
    if (!clrErr) issuesCleared = toClear.length;
  }

  await logAudit(supabase, {
    orgId: company.org_id,
    companyId,
    action: "accounting.fx.resolved",
    target: file.original_filename,
    details: { fileId, resolved, stillPending, issuesCleared },
    severity: stillPending > 0 ? "warn" : "ok",
  });
  revalidatePath(`/c/${companyId}/upload`);
}

/**
 * Remove an uploaded file: delete the row (cascades transactions + issues) and
 * its private Storage object. Gated by upload.remove; blocked when bound to a
 * locked/closed period without Correction Mode.
 */
export async function removeAccountingFileAction(fileId: string): Promise<void> {
  const supabase = await createClient();
  const file = await getAccountingFile(fileId);
  if (!file) throw new Error("File not found.");
  const companyId = file.company_id;
  await requireCapability(supabase, "upload.remove", companyId);
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found.");
  await periodMutableGuard(supabase, file.period_id);

  // DB first (atomic cascade), then best-effort storage cleanup.
  const { error: delErr } = await supabase.from("accounting_files").delete().eq("id", fileId);
  if (delErr) throw new Error(delErr.message);
  const { error: rmErr } = await supabase.storage.from("accounting-files").remove([file.storage_path]);

  // If this file superseded another and no other replacement remains, clear the
  // old file's is_superseded flag (its data + object are preserved).
  let supersedeReverted = false;
  if (file.supersedes_file_id) {
    const { count } = await supabase
      .from("accounting_files")
      .select("id", { count: "exact", head: true })
      .eq("supersedes_file_id", file.supersedes_file_id);
    if (shouldRevertSupersede(count ?? 0)) {
      const { error: revErr } = await supabase
        .from("accounting_files")
        .update({ is_superseded: false, updated_at: new Date().toISOString() })
        .eq("id", file.supersedes_file_id);
      if (!revErr) supersedeReverted = true;
    }
  }

  await logAudit(supabase, {
    orgId: company.org_id,
    companyId,
    action: "accounting.file.removed",
    target: file.original_filename,
    details: { fileId, storageRemoved: !rmErr, supersedeReverted },
    severity: "warn",
  });
  revalidatePath(`/c/${companyId}/upload`);
}

/**
 * Replace a file: upload a new version that supersedes the old one (inheriting its
 * period), and flag the old row `is_superseded` so history stays traceable. The
 * old Storage object is preserved. Gated by upload.replace.
 */
export async function replaceAccountingFileAction(formData: FormData): Promise<void> {
  const companyId = String(formData.get("companyId") ?? "");
  const oldFileId = String(formData.get("oldFileId") ?? "");
  const file = formData.get("file");
  if (!companyId || !oldFileId) throw new Error("Missing company or original file.");
  if (!(file instanceof File)) throw new Error("No replacement file provided.");

  const supabase = await createClient();
  await requireCapability(supabase, "upload.replace", companyId);
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found.");
  const old = await getAccountingFile(oldFileId);
  if (!old || old.company_id !== companyId) throw new Error("Original file not found.");

  const fileIssues = validateUploadFile({ filename: file.name, size: file.size });
  if (hasBlockingIssue(fileIssues)) {
    throw new Error(fileIssues.find((i) => i.severity === "error")!.message);
  }
  await periodMutableGuard(supabase, old.period_id);
  const isCorrectionUpload = old.is_correction_upload;

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
    period_id: old.period_id,
    storage_path: path,
    original_filename: file.name,
    file_size: file.size,
    selected_period_start: old.selected_period_start,
    selected_period_end: old.selected_period_end,
    import_status: "uploaded",
    validation_status: "pending",
    supersedes_file_id: oldFileId,
    is_correction_upload: isCorrectionUpload,
  });
  if (insErr) {
    await supabase.storage.from("accounting-files").remove([path]);
    throw new Error(insErr.message);
  }

  // Flag the old file as superseded (kept for traceability).
  const { error: supErr } = await supabase
    .from("accounting_files")
    .update({ is_superseded: true, updated_at: new Date().toISOString() })
    .eq("id", oldFileId);
  if (supErr) throw new Error(supErr.message);

  await logAudit(supabase, {
    orgId: company.org_id,
    companyId,
    action: "accounting.file.replaced",
    target: file.name,
    details: { newFileId: fileId, supersededFileId: oldFileId },
    severity: "warn",
  });
  revalidatePath(`/c/${companyId}/upload`);
}
