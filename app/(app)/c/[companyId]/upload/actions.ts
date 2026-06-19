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
import { requirePeriodMutable } from "@/lib/domain/period/lifecycle";
import { validateUploadFile, hasBlockingIssue } from "@/lib/domain/upload/parse";

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
