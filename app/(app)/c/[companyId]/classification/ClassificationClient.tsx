"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatAmount } from "@/lib/format/money";
import { buildFilterParams, EMPTY_FILTERS, matchesSearch } from "@/lib/domain/classification/filters";
import type { Database } from "@/db/types";
import {
  assignClassAction,
  bulkAssignClassAction,
  runClassificationAction,
  createRuleFromTransactionAction,
} from "./actions";
import styles from "./classification.module.css";

type Status = Database["public"]["Enums"]["tx_classification_status"];

export interface Filters {
  fileId: string;
  status: string;
  currency: string;
  dateFrom: string;
  dateTo: string;
  search: string;
}

export interface TxRow {
  id: string;
  date: string | null;
  description: string | null;
  debit: string | null;
  credit: string | null;
  amount: number | null;
  currency: Database["public"]["Enums"]["currency"] | null;
  amountGel: number | null;
  status: Status;
  classId: string | null;
  source: Database["public"]["Enums"]["classification_source"] | null;
}

const STATUS_LABEL: Record<Status, string> = {
  unclassified: "Unclassified",
  suggested: "Needs review",
  confirmed: "Classified",
  rejected: "Rejected",
};

export function ClassificationClient({
  companyId,
  canAssign,
  canRun,
  canManageRules,
  classes,
  files,
  rows,
  filters,
}: {
  companyId: string;
  canAssign: boolean;
  canRun: boolean;
  canManageRules: boolean;
  classes: { id: string; label: string; cashDirection: string }[];
  files: { id: string; filename: string }[];
  rows: TxRow[];
  filters: Filters;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkClass, setBulkClass] = useState<string>("");
  const [f, setF] = useState<Filters>(filters);
  const [optUnclass, setOptUnclass] = useState(true);
  const [optSuggested, setOptSuggested] = useState(true);
  const [optOverwrite, setOptOverwrite] = useState(false);

  const classLabel = (id: string | null) => classes.find((c) => c.id === id)?.label ?? "—";

  function run(label: string, fn: () => Promise<void>, okMsg: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        await fn();
        setNotice(okMsg);
        setSelected(new Set());
      } catch (err) {
        setError(err instanceof Error ? err.message : `${label} failed.`);
      }
    });
  }

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    // Search is client-side (live); only the server filters go into the URL.
    const p = new URLSearchParams(buildFilterParams({ ...f, search: "" }));
    router.push(`/c/${companyId}/classification${p.toString() ? `?${p}` : ""}`);
  }

  function clearFilters() {
    setF(EMPTY_FILTERS);
    router.push(`/c/${companyId}/classification`);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  // Client-side live search over the server-filtered rows (description / Dr / Cr).
  const visibleRows = rows.filter((r) => matchesSearch([r.description, r.debit, r.credit], f.search));

  function toggleAll() {
    setSelected((prev) =>
      prev.size === visibleRows.length ? new Set() : new Set(visibleRows.map((r) => r.id)),
    );
  }

  const noClasses = classes.length === 0;

  return (
    <div className={styles.wrap}>
      {noClasses && (
        <div className={styles.readonly}>
          No active class nodes in this company&apos;s structure yet. Add classes in the Structure Builder first.
        </div>
      )}

      <form className={styles.filters} onSubmit={applyFilters}>
        <select className={styles.select} value={f.fileId} onChange={(e) => setF({ ...f, fileId: e.target.value })}>
          <option value="">All files</option>
          {files.map((file) => (
            <option key={file.id} value={file.id}>{file.filename}</option>
          ))}
        </select>
        <select className={styles.select} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">Any status</option>
          <option value="unclassified">Unclassified</option>
          <option value="suggested">Needs review</option>
          <option value="confirmed">Classified</option>
        </select>
        <select className={styles.select} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
          <option value="">Any currency</option>
          <option value="GEL">GEL</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
        </select>
        <input className={styles.input} type="date" value={f.dateFrom} onChange={(e) => setF({ ...f, dateFrom: e.target.value })} />
        <input className={styles.input} type="date" value={f.dateTo} onChange={(e) => setF({ ...f, dateTo: e.target.value })} />
        <input
          className={styles.input}
          placeholder="Live search description / account"
          value={f.search}
          onChange={(e) => setF({ ...f, search: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
        />
        <button className={styles.btnSm} type="submit" disabled={pending}>Apply</button>
        <button type="button" className={styles.linkBtn} disabled={pending} onClick={clearFilters}>Clear filters</button>
      </form>

      {canRun && (
        <div className={styles.rerunBar}>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={optUnclass} onChange={(e) => setOptUnclass(e.target.checked)} /> Unclassified
          </label>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={optSuggested} onChange={(e) => setOptSuggested(e.target.checked)} /> Needs review
          </label>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={optOverwrite} onChange={(e) => setOptOverwrite(e.target.checked)} /> Overwrite rule-based
          </label>
          <span className={styles.rerunNote}>Manual classifications are never overwritten.</span>
          <button
            type="button"
            className={styles.btn}
            disabled={pending || noClasses}
            onClick={() => {
              if (optOverwrite && !window.confirm("Re-evaluate and possibly overwrite existing RULE-based classifications? (Manual ones are never changed.)")) return;
              run(
                "Run classification",
                () => runClassificationAction({
                  companyId,
                  fileId: f.fileId || null,
                  includeUnclassified: optUnclass,
                  includeSuggested: optSuggested,
                  overwriteRuleConfirmed: optOverwrite,
                }),
                "Classification run complete.",
              );
            }}
          >
            {pending ? "Working…" : "Run classification"}
          </button>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}

      {canAssign && selected.size > 0 && (
        <div className={styles.bulkBar}>
          <span>{selected.size} selected</span>
          <select className={styles.select} value={bulkClass} onChange={(e) => setBulkClass(e.target.value)}>
            <option value="">Choose class…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <button
            type="button"
            className={styles.btnSm}
            disabled={pending || !bulkClass}
            onClick={() => run("Bulk assign", () => bulkAssignClassAction({ companyId, transactionIds: [...selected], classId: bulkClass }), "Assigned selected transactions.")}
          >
            Assign selected
          </button>
        </div>
      )}

      <div className={styles.tableCard}>
        {visibleRows.length === 0 ? (
          <div className={styles.empty}>No transactions match the current filters.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                {canAssign && (
                  <th><input type="checkbox" checked={selected.size === visibleRows.length && visibleRows.length > 0} onChange={toggleAll} /></th>
                )}
                <th>Date</th>
                <th>Description</th>
                <th>Dr</th>
                <th>Cr</th>
                <th>Amount</th>
                <th>GEL</th>
                <th>Status</th>
                <th>Class</th>
                {canAssign && <th></th>}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.id} data-status={r.status}>
                  {canAssign && (
                    <td><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                  )}
                  <td>{r.date ?? "—"}</td>
                  <td className={styles.desc}>{r.description ?? "—"}</td>
                  <td>{r.debit ?? "—"}</td>
                  <td>{r.credit ?? "—"}</td>
                  <td>{r.amount !== null ? `${formatAmount(r.amount, { decimals: 2 })} ${r.currency ?? ""}` : "—"}</td>
                  <td>{r.amountGel !== null ? formatAmount(r.amountGel, { decimals: 2 }) : "—"}</td>
                  <td>
                    <span className={styles.statusBadge} data-status={r.status}>{STATUS_LABEL[r.status]}</span>
                    {r.source === "manual" && <span className={styles.manualTag}>manual</span>}
                  </td>
                  <td>
                    {canAssign ? (
                      <select
                        className={styles.select}
                        value={r.classId ?? ""}
                        disabled={pending || noClasses}
                        onChange={(e) => {
                          const classId = e.target.value;
                          if (classId) run("Assign", () => assignClassAction({ companyId, transactionId: r.id, classId }), "Class assigned.");
                        }}
                      >
                        <option value="">{classLabel(r.classId) === "—" ? "Unassigned" : classLabel(r.classId)}</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                    ) : (
                      classLabel(r.classId)
                    )}
                  </td>
                  {canAssign && (
                    <td>
                      {canManageRules && r.classId && r.debit && r.credit && (
                        <button
                          type="button"
                          className={styles.linkBtn}
                          disabled={pending}
                          onClick={() => {
                            const name = window.prompt("Rule name", `${r.debit}/${r.credit} → ${classLabel(r.classId)}`);
                            if (name !== null) {
                              run("Save rule", () => createRuleFromTransactionAction({ companyId, transactionId: r.id, classId: r.classId!, name }), "Rule saved.");
                            }
                          }}
                        >
                          save rule
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
