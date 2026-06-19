"use client";

import { useState, useTransition } from "react";
import type { Database } from "@/db/types";
import type { RuleInput } from "@/lib/domain/classification/rules";
import {
  createRuleAction,
  updateRuleAction,
  setRuleActiveAction,
  deleteRuleAction,
  previewRuleAction,
  type PreviewRow,
} from "../actions";
import styles from "../classification.module.css";

type RuleType = Database["public"]["Enums"]["classification_rule_type"];

export interface RuleListItem {
  id: string;
  name: string;
  classId: string;
  ruleType: RuleType;
  priority: number;
  confidenceScore: number;
  isActive: boolean;
  debitAccountPattern: string | null;
  creditAccountPattern: string | null;
  descriptionPattern: string | null;
  currency: Database["public"]["Enums"]["currency"] | null;
  minAmount: number | null;
  maxAmount: number | null;
  cashDirection: Database["public"]["Enums"]["cash_direction"] | null;
  updatedAt: string;
}

interface FormState {
  ruleId: string | null;
  classId: string;
  name: string;
  ruleType: RuleType;
  priority: string;
  confidenceScore: string;
  isActive: boolean;
  debitAccountPattern: string;
  creditAccountPattern: string;
  descriptionPattern: string;
  currency: string;
  minAmount: string;
  maxAmount: string;
  cashDirection: string;
}

const RULE_TYPES: RuleType[] = [
  "account_pair",
  "account_exact",
  "description_contains",
  "description_regex",
  "amount_direction",
  "combined",
];

function blankForm(): FormState {
  return {
    ruleId: null,
    classId: "",
    name: "",
    ruleType: "account_pair",
    priority: "100",
    confidenceScore: "0.9",
    isActive: true,
    debitAccountPattern: "",
    creditAccountPattern: "",
    descriptionPattern: "",
    currency: "",
    minAmount: "",
    maxAmount: "",
    cashDirection: "",
  };
}

function fromRule(r: RuleListItem): FormState {
  return {
    ruleId: r.id,
    classId: r.classId,
    name: r.name,
    ruleType: r.ruleType,
    priority: String(r.priority),
    confidenceScore: String(r.confidenceScore),
    isActive: r.isActive,
    debitAccountPattern: r.debitAccountPattern ?? "",
    creditAccountPattern: r.creditAccountPattern ?? "",
    descriptionPattern: r.descriptionPattern ?? "",
    currency: r.currency ?? "",
    minAmount: r.minAmount !== null ? String(r.minAmount) : "",
    maxAmount: r.maxAmount !== null ? String(r.maxAmount) : "",
    cashDirection: r.cashDirection ?? "",
  };
}

function toInput(s: FormState): RuleInput {
  return {
    classId: s.classId,
    name: s.name,
    ruleType: s.ruleType,
    priority: parseInt(s.priority || "100", 10),
    confidenceScore: parseFloat(s.confidenceScore || "0.9"),
    isActive: s.isActive,
    debitAccountPattern: s.debitAccountPattern || null,
    creditAccountPattern: s.creditAccountPattern || null,
    descriptionPattern: s.descriptionPattern || null,
    currency: (s.currency || null) as RuleInput["currency"],
    minAmount: s.minAmount === "" ? null : Number(s.minAmount),
    maxAmount: s.maxAmount === "" ? null : Number(s.maxAmount),
    cashDirection: (s.cashDirection || null) as RuleInput["cashDirection"],
  };
}

export function RulesClient({
  companyId,
  canManageRules,
  canRun,
  classes,
  rules,
}: {
  companyId: string;
  canManageRules: boolean;
  canRun: boolean;
  classes: { id: string; label: string; cashDirection: string }[];
  rules: RuleListItem[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);

  const classLabel = (id: string) => classes.find((c) => c.id === id)?.label ?? "(unknown)";

  function run(label: string, fn: () => Promise<void>, okMsg: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        await fn();
        setNotice(okMsg);
      } catch (err) {
        setError(err instanceof Error ? err.message : `${label} failed.`);
      }
    });
  }

  function save() {
    if (!form) return;
    const input = toInput(form);
    if (form.ruleId) {
      run("Update rule", () => updateRuleAction({ companyId, ruleId: form.ruleId!, ...input }), "Rule updated.");
    } else {
      run("Create rule", () => createRuleAction({ companyId, ...input }), "Rule created.");
    }
    setForm(null);
    setPreview(null);
  }

  function doPreview() {
    if (!form) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const rowsOut = await previewRuleAction({ companyId, rule: toInput(form) });
        setPreview(rowsOut);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Preview failed.");
      }
    });
  }

  const set = (patch: Partial<FormState>) => setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  return (
    <div className={styles.wrap}>
      {!canManageRules && (
        <div className={styles.readonly}>You do not have permission to manage classification rules.</div>
      )}
      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}

      {canManageRules && !form && (
        <button type="button" className={styles.btn} disabled={pending || classes.length === 0} onClick={() => { setPreview(null); setForm(blankForm()); }}>
          New rule
        </button>
      )}
      {canManageRules && classes.length === 0 && (
        <div className={styles.readonly}>Add an active class in the Structure Builder before creating rules.</div>
      )}

      {form && (
        <div className={styles.ruleForm}>
          <label className={styles.ruleField}><span>Name</span>
            <input className={styles.input} value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label className={styles.ruleField}><span>Target class</span>
            <select className={styles.select} value={form.classId} onChange={(e) => set({ classId: e.target.value })}>
              <option value="">Choose class…</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label className={styles.ruleField}><span>Rule type</span>
            <select className={styles.select} value={form.ruleType} onChange={(e) => set({ ruleType: e.target.value as RuleType })}>
              {RULE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className={styles.ruleField}><span>Priority (lower first)</span>
            <input className={styles.input} type="number" value={form.priority} onChange={(e) => set({ priority: e.target.value })} />
          </label>
          <label className={styles.ruleField}><span>Confidence (0–1)</span>
            <input className={styles.input} type="number" step="0.05" min="0" max="1" value={form.confidenceScore} onChange={(e) => set({ confidenceScore: e.target.value })} />
          </label>
          <label className={styles.ruleField}><span>Debit account</span>
            <input className={styles.input} value={form.debitAccountPattern} onChange={(e) => set({ debitAccountPattern: e.target.value })} />
          </label>
          <label className={styles.ruleField}><span>Credit account</span>
            <input className={styles.input} value={form.creditAccountPattern} onChange={(e) => set({ creditAccountPattern: e.target.value })} />
          </label>
          <label className={styles.ruleField}><span>Description pattern</span>
            <input className={styles.input} value={form.descriptionPattern} onChange={(e) => set({ descriptionPattern: e.target.value })} />
          </label>
          <label className={styles.ruleField}><span>Currency</span>
            <select className={styles.select} value={form.currency} onChange={(e) => set({ currency: e.target.value })}>
              <option value="">Any</option><option value="GEL">GEL</option><option value="USD">USD</option><option value="EUR">EUR</option>
            </select>
          </label>
          <label className={styles.ruleField}><span>Direction</span>
            <select className={styles.select} value={form.cashDirection} onChange={(e) => set({ cashDirection: e.target.value })}>
              <option value="">Any</option><option value="in">In</option><option value="out">Out</option>
            </select>
          </label>
          <label className={styles.ruleField}><span>Min amount</span>
            <input className={styles.input} type="number" value={form.minAmount} onChange={(e) => set({ minAmount: e.target.value })} />
          </label>
          <label className={styles.ruleField}><span>Max amount</span>
            <input className={styles.input} type="number" value={form.maxAmount} onChange={(e) => set({ maxAmount: e.target.value })} />
          </label>
          <label className={styles.ruleField}><span>Active</span>
            <input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
          </label>
          <div className={styles.ruleFormActions}>
            <button type="button" className={styles.btn} disabled={pending} onClick={save}>{form.ruleId ? "Save changes" : "Create rule"}</button>
            {canRun && <button type="button" className={styles.btnSm} disabled={pending} onClick={doPreview}>Preview matches</button>}
            <button type="button" className={styles.linkBtn} onClick={() => { setForm(null); setPreview(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {preview && (
        <div className={styles.tableCard}>
          <div className={styles.covLabel}>Preview — {preview.filter((p) => p.wouldMatch).length} of {preview.length} unresolved rows would match (read-only)</div>
          <table className={styles.table}>
            <thead><tr><th>Match</th><th>Date</th><th>Description</th><th>Dr</th><th>Cr</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {preview.map((p) => (
                <tr key={p.id}>
                  <td className={p.wouldMatch ? styles.previewMatch : styles.previewNo}>{p.wouldMatch ? "✓" : "—"}</td>
                  <td>{p.date ?? "—"}</td>
                  <td className={styles.desc}>{p.description ?? "—"}</td>
                  <td>{p.debit ?? "—"}</td>
                  <td>{p.credit ?? "—"}</td>
                  <td>{p.amount !== null ? `${p.amount} ${p.currency ?? ""}` : "—"}</td>
                  <td>{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.tableCard}>
        {rules.length === 0 ? (
          <div className={styles.empty}>No rules yet.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Active</th><th>Name</th><th>Class</th><th>Type</th><th>Priority</th><th>Conf.</th>
                <th>Dr</th><th>Cr</th><th>Description</th><th>Updated</th>{canManageRules && <th></th>}
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} style={{ opacity: r.isActive ? 1 : 0.55 }}>
                  <td>{r.isActive ? "✓" : "—"}</td>
                  <td>{r.name}</td>
                  <td>{classLabel(r.classId)}</td>
                  <td>{r.ruleType}</td>
                  <td>{r.priority}</td>
                  <td>{r.confidenceScore}</td>
                  <td>{r.debitAccountPattern ?? "—"}</td>
                  <td>{r.creditAccountPattern ?? "—"}</td>
                  <td className={styles.desc}>{r.descriptionPattern ?? "—"}</td>
                  <td>{new Date(r.updatedAt).toLocaleDateString()}</td>
                  {canManageRules && (
                    <td>
                      <div className={styles.actions}>
                        <button type="button" className={styles.linkBtn} disabled={pending} onClick={() => { setPreview(null); setForm(fromRule(r)); }}>Edit</button>
                        <button type="button" className={styles.linkBtn} disabled={pending} onClick={() => run("Toggle", () => setRuleActiveAction({ companyId, ruleId: r.id, active: !r.isActive }), r.isActive ? "Rule disabled." : "Rule enabled.")}>
                          {r.isActive ? "Disable" : "Enable"}
                        </button>
                        <button type="button" className={styles.linkBtn} disabled={pending} onClick={() => { if (window.confirm(`Delete rule "${r.name}"? Classified rows are kept but lose the rule link.`)) run("Delete", () => deleteRuleAction({ companyId, ruleId: r.id }), "Rule deleted."); }}>Delete</button>
                      </div>
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
