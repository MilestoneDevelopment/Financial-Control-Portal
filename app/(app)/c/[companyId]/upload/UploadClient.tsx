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
import {
  uploadAccountingFileAction,
  parseAccountingFileAction,
  resolveFxForFileAction,
  removeAccountingFileAction,
  replaceAccountingFileAction,
} from "./actions";
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
  resolvedAt: string | null;
}

export interface FileRow {
  id: string;
  filename: string;
  size: number | null;
  importStatus: ImportStatus;
  validationStatus: ValidationStatus;
  rowCount: number | null;
  isCorrection: boolean;
  isSuperseded: boolean;
  detectedStart: string | null;
  detectedEnd: string | null;
  createdAt: string;
  fxPending: number;
  fxResolved: number;
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
  canRemove,
  canReplace,
  periods,
  files,
  issuesByFile,
}: {
  companyId: string;
  canUpload: boolean;
  canRemove: boolean;
  canReplace: boolean;
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openIssues, setOpenIssues] = useState<string | null>(null);

  function run(label: string, fileId: string | null, fn: () => Promise<void>, okMsg: string) {
    setError(null);
    setNotice(null);
    setBusyId(fileId);
    startTransition(async () => {
      try {
        await fn();
        setNotice(okMsg);
      } catch (err) {
        setError(err instanceof Error ? err.message : `${label} failed.`);
      } finally {
        setBusyId(null);
      }
    });
  }

  function onUpload(e: React.FormEvent) {
    e.preventDefault();
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
    run("Upload", null, () => uploadAccountingFileAction(fd), `Uploaded “${file.name}”. Use Parse to import.`);
    setFileName("");
    if (input) input.value = "";
  }

  function onReplace(oldFileId: string, file: File) {
    const fd = new FormData();
    fd.set("companyId", companyId);
    fd.set("oldFileId", oldFileId);
    fd.set("file", file);
    run("Replace", oldFileId, () => replaceAccountingFileAction(fd), `Replaced with “${file.name}”. Parse the new file to import.`);
  }

  function onRemove(fileId: string, name: string) {
    if (!window.confirm(`Remove “${name}” and all its imported rows? This cannot be undone.`)) return;
    run("Remove", fileId, () => removeAccountingFileAction(fileId), "File removed.");
  }

  return (
    <div className={styles.wrap}>
      {!canUpload && (
        <div className={styles.readonly}>
          You do not have permission to upload files (requires “Upload accounting file”).
        </div>
      )}

      {canUpload && (
        <form className={styles.card} onSubmit={onUpload}>
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
          <button className={styles.btn} type="submit" disabled={pending}>
            {pending && busyId === null ? "Uploading…" : "Upload file"}
          </button>
        </form>
      )}

      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}

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
                <th>FX</th>
                <th>Detected period</th>
                <th>Issues</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => {
                const issues = issuesByFile[f.id] ?? [];
                const activeIssues = issues.filter((i) => !i.resolvedAt);
                const resolvedIssues = issues.filter((i) => i.resolvedAt);
                const parseable = f.importStatus === "uploaded" || f.importStatus === "failed";
                const canResolveFx = f.importStatus === "imported" && f.fxPending > 0;
                const detected =
                  f.detectedStart && f.detectedEnd ? `${f.detectedStart} → ${f.detectedEnd}` : "—";
                const rowBusy = busyId === f.id;
                const fxLabel =
                  f.fxPending + f.fxResolved === 0
                    ? "—"
                    : `${f.fxResolved} ok${f.fxPending > 0 ? ` · ${f.fxPending} pending` : ""}`;
                return (
                  <Fragment key={f.id}>
                    <tr>
                      <td>
                        {f.filename}
                        {f.isCorrection && <span className={styles.badge}>correction</span>}
                        {f.isSuperseded && <span className={styles.badgeMuted}>superseded</span>}
                      </td>
                      <td>{formatBytes(f.size)}</td>
                      <td>{IMPORT_STATUS_LABEL[f.importStatus]}</td>
                      <td>{VALIDATION_STATUS_LABEL[f.validationStatus]}</td>
                      <td>{f.rowCount ?? "—"}</td>
                      <td>{fxLabel}</td>
                      <td>{detected}</td>
                      <td>
                        {issues.length > 0 ? (
                          <button
                            type="button"
                            className={styles.linkBtn}
                            onClick={() => setOpenIssues(openIssues === f.id ? null : f.id)}
                          >
                            {activeIssues.length}
                            {resolvedIssues.length > 0 ? ` (+${resolvedIssues.length})` : ""}{" "}
                            {openIssues === f.id ? "▲" : "▼"}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <div className={styles.actions}>
                          {canUpload && parseable && (
                            <button type="button" className={styles.btnSm} disabled={pending} onClick={() =>
                              run("Parse", f.id, () => parseAccountingFileAction(f.id), "Parse complete.")
                            }>
                              {rowBusy ? "…" : f.importStatus === "failed" ? "Retry" : "Parse"}
                            </button>
                          )}
                          {canUpload && canResolveFx && (
                            <button type="button" className={styles.btnSm} disabled={pending} onClick={() =>
                              run("Resolve FX", f.id, () => resolveFxForFileAction(f.id), "FX resolution complete.")
                            }>
                              {rowBusy ? "…" : "Resolve FX"}
                            </button>
                          )}
                          {canReplace && (
                            <label className={styles.btnSmGhost}>
                              Replace
                              <input
                                type="file"
                                accept=".xlsx,.xls"
                                hidden
                                disabled={pending}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) onReplace(f.id, file);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                          )}
                          {canRemove && (
                            <button type="button" className={styles.btnSmDanger} disabled={pending} onClick={() => onRemove(f.id, f.filename)}>
                              Remove
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {openIssues === f.id && issues.length > 0 && (
                      <tr>
                        <td colSpan={9} className={styles.issuesCell}>
                          {activeIssues.map((iss, idx) => (
                            <div key={`a${idx}`} className={styles.issueLine} data-sev={iss.severity}>
                              <span className={styles.issueCode}>{iss.code}</span>
                              {iss.rowIndex != null && <span className={styles.issueRow}>row {iss.rowIndex}</span>}
                              <span>{iss.message}</span>
                            </div>
                          ))}
                          {resolvedIssues.map((iss, idx) => (
                            <div key={`r${idx}`} className={styles.issueLineResolved}>
                              <span className={styles.issueCode}>{iss.code}</span>
                              {iss.rowIndex != null && <span className={styles.issueRow}>row {iss.rowIndex}</span>}
                              <span>{iss.message}</span>
                              <span className={styles.resolvedTag}>resolved</span>
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
