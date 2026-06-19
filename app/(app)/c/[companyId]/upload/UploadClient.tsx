"use client";

import { useRef, useState, useTransition } from "react";
import {
  IMPORT_STATUS_LABEL,
  VALIDATION_STATUS_LABEL,
  type ImportStatus,
  type ValidationStatus,
} from "@/lib/domain/upload/status";
import type { PeriodStatus } from "@/lib/domain/period/lifecycle";
import { uploadAccountingFileAction } from "./actions";
import styles from "./upload.module.css";

export interface PeriodOption {
  id: string;
  label: string;
  status: PeriodStatus;
  mutable: boolean;
}

export interface FileRow {
  id: string;
  filename: string;
  size: number | null;
  importStatus: ImportStatus;
  validationStatus: ValidationStatus;
  rowCount: number | null;
  isCorrection: boolean;
  createdAt: string;
}

function formatBytes(n: number | null): string {
  if (n === null || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function UploadClient({
  companyId,
  canUpload,
  periods,
  files,
}: {
  companyId: string;
  canUpload: boolean;
  periods: PeriodOption[];
  files: FileRow[];
}) {
  const [periodId, setPeriodId] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const input = fileRef.current;
    const file = input?.files?.[0];
    if (!file) {
      setError("Choose an Excel file first.");
      return;
    }
    const fd = new FormData();
    fd.set("companyId", companyId);
    if (periodId) fd.set("periodId", periodId);
    fd.set("file", file);

    startTransition(async () => {
      try {
        await uploadAccountingFileAction(fd);
        setNotice(`Uploaded “${file.name}”. Parsing & import arrive in Phase 2B.`);
        setFileName("");
        if (input) input.value = "";
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      }
    });
  }

  return (
    <div className={styles.wrap}>
      {!canUpload && (
        <div className={styles.readonly}>
          You do not have permission to upload files (requires “Upload accounting file”).
        </div>
      )}

      {canUpload && (
        <form className={styles.card} onSubmit={onSubmit}>
          <div className={styles.cardTitle}>Upload accounting export</div>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Period (optional)</span>
            <select
              className={styles.select}
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              disabled={pending}
            >
              <option value="">No specific period</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.mutable}>
                  {p.label}
                  {!p.mutable ? " — locked (Correction Mode required)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Excel file (.xlsx / .xls)</span>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className={styles.fileInput}
              disabled={pending}
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
            />
          </label>

          {fileName && <div className={styles.hint}>Selected: {fileName}</div>}
          {error && <div className={styles.error}>{error}</div>}
          {notice && <div className={styles.notice}>{notice}</div>}

          <button className={styles.btn} type="submit" disabled={pending}>
            {pending ? "Uploading…" : "Upload file"}
          </button>
        </form>
      )}

      <div className={styles.tableCard}>
        <div className={styles.cardTitle}>Uploaded files</div>
        {files.length === 0 ? (
          <div className={styles.empty}>No files uploaded yet.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>File</th>
                <th>Size</th>
                <th>Import</th>
                <th>Validation</th>
                <th>Rows</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id}>
                  <td>
                    {f.filename}
                    {f.isCorrection && <span className={styles.badge}>correction</span>}
                  </td>
                  <td>{formatBytes(f.size)}</td>
                  <td>{IMPORT_STATUS_LABEL[f.importStatus]}</td>
                  <td>{VALIDATION_STATUS_LABEL[f.validationStatus]}</td>
                  <td>{f.rowCount ?? "—"}</td>
                  <td>{formatWhen(f.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
