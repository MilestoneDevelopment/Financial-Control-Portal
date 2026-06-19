import { TopBar } from "@/components/shell/TopBar";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { capabilityMap } from "@/lib/auth/guards";
import { listPeriods } from "@/lib/data/periods";
import { periodLabel, isPeriodMutable } from "@/lib/domain/period/lifecycle";
import { listAccountingFiles, listCompanyIssues, fxSummaryByFile } from "@/lib/data/uploads";
import { UploadClient, type PeriodOption, type FileRow, type IssueRow } from "./UploadClient";
import styles from "./upload.module.css";

export const dynamic = "force-dynamic";

export default async function UploadPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;

  let canUpload = false;
  let canRemove = false;
  let canReplace = false;
  let periods: PeriodOption[] = [];
  let files: FileRow[] = [];
  let issuesByFile: Record<string, IssueRow[]> = {};

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const caps = await capabilityMap(supabase, companyId, ["upload.file", "upload.remove", "upload.replace"]);
    canUpload = caps["upload.file"];
    canRemove = caps["upload.remove"];
    canReplace = caps["upload.replace"];
    periods = (await listPeriods(companyId)).map((p) => ({
      id: p.id,
      label: periodLabel({ year: p.year, month: p.month }),
      status: p.status,
      mutable: isPeriodMutable({ status: p.status, is_correction_mode: p.is_correction_mode }),
    }));
    const fx = await fxSummaryByFile(companyId);
    files = (await listAccountingFiles(companyId)).map((f) => ({
      id: f.id,
      filename: f.original_filename,
      size: f.file_size,
      importStatus: f.import_status,
      validationStatus: f.validation_status,
      rowCount: f.row_count,
      isCorrection: f.is_correction_upload,
      isSuperseded: f.is_superseded,
      detectedStart: f.detected_period_start,
      detectedEnd: f.detected_period_end,
      createdAt: f.created_at,
      fxPending: fx[f.id]?.pending ?? 0,
      fxResolved: fx[f.id]?.resolved ?? 0,
    }));
    issuesByFile = {};
    for (const iss of await listCompanyIssues(companyId)) {
      (issuesByFile[iss.file_id] ??= []).push({
        rowIndex: iss.row_index,
        severity: iss.severity,
        code: iss.code,
        message: iss.message,
      });
    }
  }

  return (
    <>
      <TopBar
        title="Accounting File Upload"
        subtitle="Import and validate monthly accounting exports"
        usesPeriod={false}
      />
      <div className={styles.pageBody}>
        <UploadClient
          companyId={companyId}
          canUpload={canUpload}
          canRemove={canRemove}
          canReplace={canReplace}
          periods={periods}
          files={files}
          issuesByFile={issuesByFile}
        />
      </div>
    </>
  );
}
