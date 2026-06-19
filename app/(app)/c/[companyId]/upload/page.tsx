import { TopBar } from "@/components/shell/TopBar";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { capabilityMap } from "@/lib/auth/guards";
import { listPeriods } from "@/lib/data/periods";
import { periodLabel, isPeriodMutable } from "@/lib/domain/period/lifecycle";
import { listAccountingFiles, listCompanyIssues } from "@/lib/data/uploads";
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
  let periods: PeriodOption[] = [];
  let files: FileRow[] = [];
  let issuesByFile: Record<string, IssueRow[]> = {};

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    canUpload = (await capabilityMap(supabase, companyId, ["upload.file"]))["upload.file"];
    periods = (await listPeriods(companyId)).map((p) => ({
      id: p.id,
      label: periodLabel({ year: p.year, month: p.month }),
      status: p.status,
      mutable: isPeriodMutable({ status: p.status, is_correction_mode: p.is_correction_mode }),
    }));
    files = (await listAccountingFiles(companyId)).map((f) => ({
      id: f.id,
      filename: f.original_filename,
      size: f.file_size,
      importStatus: f.import_status,
      validationStatus: f.validation_status,
      rowCount: f.row_count,
      isCorrection: f.is_correction_upload,
      detectedStart: f.detected_period_start,
      detectedEnd: f.detected_period_end,
      createdAt: f.created_at,
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
          periods={periods}
          files={files}
          issuesByFile={issuesByFile}
        />
      </div>
    </>
  );
}
