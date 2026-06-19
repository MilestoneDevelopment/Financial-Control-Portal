"use client";

import { Fragment, useRef, useState, useTransition } from "react";
import {
  IMPORT_STATUS_LABEL,
  VALIDATION_STATUS_LABEL,
  type ImportStatus,
  type ValidationStatus,
  type IssueSeverity,
} from "@/lib/domain/upload/status";
import type { PeriodStatus } from "@/lib/domain/period/lifecycle";
import { uploadAccountingFileAction, parseAccountingFileAction } from "./actions";
import styles from "./upload.module.css";

export interface PeriodOption {
  id: string;
  label: string;
  status: PeriodStatus;
  mutable: boolean;
}

export interface IssueRow {
  rowIndex: number | null;
  severity: IssueSeverity;
  code: string;
  message: string;
}

export interface FileRow {
  id: string;
  filename: string;
  size: number | null;
  importStatus: ImportStatus;
  validationStatus: ValidationStatus;
  rowCount: number | null;
  isCorrection: boolean;
  detectedStart: string | null;
  detectedEnd: string | null;
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
  issuesByFile,
}: {
  companyId: string;
  canUpload: boolean;
  periods: PeriodOption[];
  files: FileRow[];
  issuesByFile: Record<string, IssueRow[]>;
}) {
  const [periodId, setPeriodId] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [parsingId, setParsingId] = useState<string | null>(null);
  const [openIssues, setOpenIssues] = useState<string | null>(null);

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
        setNotice(`Uploaded “${file.name}”. Use Parse to import its rows.`);
        setFileName("");
        if (input) input.value = "";
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      }
    });
  }

  function onParse(fileId: string) {
    setError(null);
    setNotice(null);
    setParsingId(fileId);
    startTransition(async () => {
      try {
        await parseAccountingFileAction(fileId);
        setNotice("Parse complete. Status and row count updated below.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Parse failed.");
      } finally {
        setParsingId(null);
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
            {pending && !parsingId ? "Uploading…" : "Upload file"}
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
                <th>Detected period</th>
                <th>Issues</th>
                <th>Uploaded</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => {
                const issues = issuesByFile[f.id] ?? [];
                const parseable = f.importStatus === "uploaded" || f.importStatus === "failed";
                const detected =
                  f.detectedStart && f.detectedEnd ? `${f.detectedStart} → ${f.detectedEnd}` : "—";
                return (
                  <Fragment key={f.id}>
                    <tr>
                      <td>
                        {f.filename}
                        {f.isCorrection && <span className={styles.badge}>correction</span>}
                      </td>
                      <td>{formatBytes(f.size)}</td>
                      <td>{IMPORT_STATUS_LABEL[f.importStatus]}</td>
                      <td>{VALIDATION_STATUS_LABEL[f.validationStatus]}</td>
                      <td>{f.rowCount ?? "—"}</td>
                      <td>{detected}</td>
                      <td>
                        {issues.length > 0 ? (
                          <button
                            type="button"
                            className={styles.linkBtn}
                            onClick={() => setOpenIssues(openIssues === f.id ? null : f.id)}
                          >
                            {issues.length} {openIssues === f.id ? "▲" : "▼"}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{formatWhen(f.createdAt)}</td>
                      <td>
                        {canUpload && parseable && (
                          <button
                            type="button"
                            className={styles.btnSm}
                            disabled={pending}
                            onClick={() => onParse(f.id)}
                          >
                            {parsingId === f.id ? "Parsing…" : f.importStatus === "failed" ? "Retry" : "Parse"}
                          </button>
                        )}
                      </td>
                    </tr>
                    {openIssues === f.id && issues.length > 0 && (
                      <tr>
                        <td colSpan={9} className={styles.issuesCell}>
                          {issues.map((iss, idx) => (
                            <div key={idx} className={styles.issueLine} data-sev={iss.severity}>
                              <span className={styles.issueCode}>{iss.code}</span>
                              {iss.rowIndex != null && <span className={styles.issueRow}>row {iss.rowIndex}</span>}
                              <span>{iss.message}</span>
                            </div>
                          ))}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
