"use client";

import { useState, useTransition } from "react";
import type { Database } from "@/db/types";
import {
  defaultsForRuleType,
  PRIORITY_OPTIONS,
  CONFIDENCE_OPTIONS,
  type RuleInput,
} from "@/lib/domain/classification/rules";
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

// Display labels only - internal rule_type values are unchanged.
const RULE_TYPE_LABELS: Record<RuleType, string> = {
  account_pair: "Account pair",
  account_exact: "Single account",
  description_contains: "Description contains",
  description_regex: "Advanced text pattern",
  amount_direction: "Amount / direction",
  combined: "Combined conditions",
};

const RULE_TYPE_HELP: Record<RuleType, string> = {
  account_pair: "Best for reliable rules based on debit and credit account pair.",
  account_exact: "Matches when either debit or credit account fits the account pattern.",
  description_contains: "Matches repeated words in descriptions, such as salary, VAT, rent, bank fee.",
  description_regex: "Technical pattern matching. Use carefully.",
  amount_direction: "Uses amount, currency, and cash direction filters.",
  combined: "Combines accounts, description, currency, amount, and direction.",
};

/** Render preset options, keeping any non-preset stored value (e.g. an older
 * custom rule) so editing never silently changes it. */
function presetOptions(
  base: { value: number; label: string }[],
  current: string,
): { value: string; label: string }[] {
  const list = base.map((o) => ({ value: String(o.value), label: o.label }));
  if (current && !list.some((o) => o.value === current)) {
    list.unshift({ value: current, label: `${current} (custom)` });
  }
  return list;
}

function blankForm(): FormState {
  const d = defaultsForRuleType("account_pair");
  return {
    ruleId: null,
    classId: "",
    name: "",
    ruleType: "account_pair",
    priority: String(d.priority),
    confidenceScore: String(d.confidence),
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
  const [showNonMatches, setShowNonMatches] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    setShowNonMatches(false);
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

      <div className={styles.rulesHeader}>
        <span className={styles.rulesHeaderTitle}>Rules [ {rules.length} ]</span>
        {canManageRules && !form && (
          <button type="button" className={styles.btnCompact} disabled={pending || classes.length === 0} onClick={() => { setPreview(null); setForm(blankForm()); }}>
            Create rule
          </button>
        )}
      </div>
      {canManageRules && classes.length === 0 && (
        <div className={styles.readonly}>Add an active class in the Structure Builder before creating rules.</div>
      )}

      {form && (
        <div className={styles.ruleFormCard}>
          <div className={styles.ruleFormLayout}>
            <div className={styles.formMain}>
            <div className={styles.ruleSection}>
              <div className={styles.ruleSectionTitle}>{form.ruleId ? "Edit rule" : "New rule"} · identity</div>
              <div className={styles.identityGrid}>
                <label className={`${styles.ruleField} ${styles.fieldName}`}><span>Name {form.ruleId ? "" : "(required to save)"}</span>
                  <input className={styles.input} value={form.name} onChange={(e) => set({ name: e.target.value })} />
                </label>
                <label className={`${styles.ruleField} ${styles.fieldClass}`}><span>Target class</span>
                  <select className={styles.select} value={form.classId} onChange={(e) => set({ classId: e.target.value })}>
                    <option value="">Choose class…</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </label>
                <div className={`${styles.activeCard} ${styles.fieldActive}`}>
                  <label className={styles.toggle}>
                    <input type="checkbox" className={styles.toggleInput} checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
                    <span className={styles.toggleSlider} />
                  </label>
                  <span className={styles.activeText}>
                    <strong>Active</strong>
                    <small>Used when classification runs</small>
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.ruleSection}>
              <div className={styles.ruleSectionTitle}>Match logic</div>
              <div className={styles.matchGrid}>
                <label className={`${styles.ruleField} ${styles.fieldRuleType}`}><span>Rule type</span>
                  <select
                    className={styles.select}
                    value={form.ruleType}
                    onChange={(e) => {
                      const t = e.target.value as RuleType;
                      const d = defaultsForRuleType(t);
                      // Apply sensible per-type defaults; user can still tweak under Advanced.
                      set({ ruleType: t, priority: String(d.priority), confidenceScore: String(d.confidence) });
                    }}
                  >
                    {RULE_TYPES.map((t) => <option key={t} value={t}>{RULE_TYPE_LABELS[t]}</option>)}
                  </select>
                  <span className={styles.fieldHint}>{RULE_TYPE_HELP[form.ruleType]}</span>
                </label>
                <label className={`${styles.ruleField} ${styles.fieldAccount}`}><span>Debit account</span>
                  <input className={styles.input} value={form.debitAccountPattern} onChange={(e) => set({ debitAccountPattern: e.target.value })} />
                </label>
                <label className={`${styles.ruleField} ${styles.fieldAccount}`}><span>Credit account</span>
                  <input className={styles.input} value={form.creditAccountPattern} onChange={(e) => set({ creditAccountPattern: e.target.value })} />
                </label>
                <label className={`${styles.ruleField} ${styles.fieldDescription}`}><span>Description pattern</span>
                  <input className={styles.input} value={form.descriptionPattern} onChange={(e) => set({ descriptionPattern: e.target.value })} />
                  <span className={styles.fieldHint}>Text to find in descriptions. Use repeated words like salary, VAT, rent, bank fee, consulting.</span>
                </label>
                <label className={`${styles.ruleField} ${styles.fieldCompact}`}><span>Currency</span>
                  <select className={styles.select} value={form.currency} onChange={(e) => set({ currency: e.target.value })}>
                    <option value="">Any</option><option value="GEL">GEL</option><option value="USD">USD</option><option value="EUR">EUR</option>
                  </select>
                </label>
                <label className={`${styles.ruleField} ${styles.fieldCompact}`}><span>Direction</span>
                  <select className={styles.select} value={form.cashDirection} onChange={(e) => set({ cashDirection: e.target.value })}>
                    <option value="">Any</option><option value="in">Cash In</option><option value="out">Cash Out</option>
                  </select>
                </label>
                <div className={`${styles.ruleField} ${styles.amountRangeGroup}`}>
                  <span className={styles.amountRangeLabel}>Amount range</span>
                  <div className={styles.amountRange}>
                    <input className={styles.input} type="number" placeholder="Min" value={form.minAmount} onChange={(e) => set({ minAmount: e.target.value })} />
                    <input className={styles.input} type="number" placeholder="Max" value={form.maxAmount} onChange={(e) => set({ maxAmount: e.target.value })} />
                  </div>
                  <span className={styles.fieldHint}>Optional. Leave blank to apply to any amount.</span>
                </div>
              </div>
            </div>

            <div className={styles.ruleSection}>
              <button type="button" className={styles.advancedToggle} onClick={() => setShowAdvanced((v) => !v)}>
                {showAdvanced ? "▾" : "▸"} Advanced settings
              </button>
              <span className={styles.fieldHint}>
                Priority and confidence are set automatically from the rule type. Open only if you need to fine-tune.
              </span>
              {showAdvanced && (
                <div className={styles.advancedGrid}>
                  <label className={`${styles.ruleField} ${styles.fieldAdvanced}`}><span>Priority</span>
                    <select className={styles.select} value={form.priority} onChange={(e) => set({ priority: e.target.value })}>
                      {presetOptions(PRIORITY_OPTIONS, form.priority).map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <span className={styles.fieldHint}>Lower numbers run first. Use specific rules earlier and broad fallback rules later.</span>
                  </label>
                  <label className={`${styles.ruleField} ${styles.fieldAdvanced}`}><span>Confidence</span>
                    <select className={styles.select} value={form.confidenceScore} onChange={(e) => set({ confidenceScore: e.target.value })}>
                      {presetOptions(CONFIDENCE_OPTIONS, form.confidenceScore).map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <span className={styles.fieldHint}>Used by the engine to indicate reliability. Defaults are set from rule type.</span>
                  </label>
                </div>
              )}
            </div>

            <div className={styles.ruleFormActions}>
              <button type="button" className={styles.btnCompact} disabled={pending} onClick={save}>{form.ruleId ? "Save changes" : "Create rule"}</button>
              {canRun && <button type="button" className={styles.btnSmGhost} disabled={pending} onClick={doPreview}>Preview matches</button>}
              <button type="button" className={styles.linkBtn} onClick={() => { setForm(null); setPreview(null); }}>Cancel</button>
            </div>
            </div>{/* formMain */}

            <aside className={styles.previewRail}>
              <div className={styles.previewRailTitle}>Preview</div>
              <div className={styles.previewNote}>
                Read-only. No transactions are changed until you create the rule and run classification.
              </div>
              {!preview ? (
                <div className={styles.previewRailEmpty}>
                  Run Preview matches to see which unresolved transactions this rule would affect.
                </div>
              ) : (() => {
                const matches = preview.filter((p) => p.wouldMatch);
                const nonMatches = preview.filter((p) => !p.wouldMatch);
                const shown = showNonMatches ? preview : matches;
                return (
                  <>
                    <div className={styles.previewSummary}>
                      {matches.length} match{matches.length === 1 ? "" : "es"} of {preview.length} scanned
                    </div>
                    {matches.length === 0 && !showNonMatches ? (
                      <div className={styles.previewRailEmpty}>No matching unresolved transactions found.</div>
                    ) : (
                      <ul className={styles.previewList}>
                        {shown.map((p) => (
                          <li key={p.id} className={styles.previewItem} data-match={p.wouldMatch}>
                            <span className={styles.previewItemTop}>
                              <span>{p.wouldMatch ? "✓" : "-"}</span>
                              <span className={styles.previewItemDesc}>{p.description ?? "-"}</span>
                            </span>
                            <span className={styles.previewItemMeta}>
                              {p.date ?? "-"} · {p.debit ?? "-"}/{p.credit ?? "-"} · {p.amount !== null ? `${p.amount} ${p.currency ?? ""}` : "-"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {nonMatches.length > 0 && (
                      <button type="button" className={styles.linkBtn} onClick={() => setShowNonMatches((v) => !v)}>
                        {showNonMatches ? "Hide scanned non-matches" : `Show scanned non-matches [ ${nonMatches.length} ]`}
                      </button>
                    )}
                  </>
                );
              })()}
            </aside>
          </div>{/* ruleFormLayout */}
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
                  <td>{r.isActive ? "✓" : "-"}</td>
                  <td>{r.name}</td>
                  <td>{classLabel(r.classId)}</td>
                  <td>{RULE_TYPE_LABELS[r.ruleType]}</td>
                  <td>{r.priority}</td>
                  <td>{r.confidenceScore}</td>
                  <td>{r.debitAccountPattern ?? "-"}</td>
                  <td>{r.creditAccountPattern ?? "-"}</td>
                  <td className={styles.desc}>{r.descriptionPattern ?? "-"}</td>
                  <td>{new Date(r.updatedAt).toLocaleDateString()}</td>
                  {canManageRules && (
                    <td>
                      <div className={styles.actions}>
                        <button type="button" className={styles.btnSmGhost} disabled={pending} onClick={() => { setPreview(null); setForm(fromRule(r)); }}>Edit</button>
                        <button type="button" className={styles.btnSmGhost} disabled={pending} onClick={() => run("Toggle", () => setRuleActiveAction({ companyId, ruleId: r.id, active: !r.isActive }), r.isActive ? "Rule disabled." : "Rule enabled.")}>
                          {r.isActive ? "Disable" : "Enable"}
                        </button>
                        <button type="button" className={styles.btnSmDanger} disabled={pending} onClick={() => { if (window.confirm(`Delete rule "${r.name}"? Classified rows are kept but lose the rule link.`)) run("Delete", () => deleteRuleAction({ companyId, ruleId: r.id }), "Rule deleted."); }}>Delete</button>
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
