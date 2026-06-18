"use client";

import { useState, useTransition } from "react";
import { formatAmount } from "@/lib/format/money";
import {
  ALLOWED_TRANSITIONS,
  PERIOD_STATUS_LABEL,
  periodLabel,
  type PeriodStatus,
} from "@/lib/domain/period/lifecycle";
import {
  createPeriodAction,
  transitionPeriodAction,
  setCorrectionModeAction,
  setOpeningBalanceAction,
} from "./actions";
import styles from "./dashboard.module.css";

export interface PeriodLite {
  id: string;
  year: number;
  month: number | null;
  status: PeriodStatus;
  is_correction_mode: boolean;
  correction_reason: string | null;
  opening_balance: number | null;
  closing_balance: number | null;
  opening_balance_source: "carried" | "imported" | "manual" | null;
}

interface Caps {
  approveLock: boolean;
  correction: boolean;
  setOpening: boolean;
}

const STATUS_STYLE: Record<PeriodStatus, { color: string; bg: string }> = {
  draft: { color: "#1499b8", bg: "#e5f7fb" },
  active: { color: "#2d7fad", bg: "#e5f1f7" },
  locked: { color: "#6b7280", bg: "#f0f1f3" },
  closed: { color: "#15171a", bg: "#e7e5df" },
  archived: { color: "#8a9099", bg: "#f0f1f3" },
};

export function PeriodsPanel({
  companyId,
  periods,
  caps,
}: {
  companyId: string;
  periods: PeriodLite[];
  caps: Caps;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed.");
      }
    });
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <div className={styles.panelTitle}>Periods</div>
        {caps.approveLock && (
          <form
            className={styles.createForm}
            onSubmit={(e) => {
              e.preventDefault();
              run(() => createPeriodAction({ companyId, year, month }));
            }}
          >
            <input
              className={styles.numInput}
              type="number"
              value={year}
              min={2000}
              max={2100}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="Year"
            />
            <select
              className={styles.select}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              aria-label="Month"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {periodLabel({ year, month: m }).split(" ")[0]}
                </option>
              ))}
            </select>
            <button className={styles.btnSm} type="submit" disabled={pending}>
              Open period
            </button>
          </form>
        )}
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {periods.length === 0 ? (
        <div className={styles.empty}>No periods yet.</div>
      ) : (
        <div className={styles.list}>
          {periods.map((p) => (
            <PeriodRow key={p.id} companyId={companyId} period={p} caps={caps} pending={pending} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}

function PeriodRow({
  companyId,
  period,
  caps,
  pending,
  run,
}: {
  companyId: string;
  period: PeriodLite;
  caps: Caps;
  pending: boolean;
  run: (fn: () => Promise<void>) => void;
}) {
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [obOpen, setObOpen] = useState(false);
  const [ob, setOb] = useState(period.opening_balance?.toString() ?? "");

  const s = STATUS_STYLE[period.status];
  const transitions = ALLOWED_TRANSITIONS[period.status];

  return (
    <div className={styles.row}>
      <div className={styles.rowMain}>
        <span className={styles.periodLabel}>{periodLabel(period)}</span>
        <span className={styles.badge} style={{ color: s.color, background: s.bg }}>
          {PERIOD_STATUS_LABEL[period.status]}
        </span>
        {period.is_correction_mode && (
          <span className={styles.correction} title={period.correction_reason ?? ""}>
            Correction Mode
          </span>
        )}
        <span className={styles.balances} data-num>
          Open {period.opening_balance == null ? "—" : formatAmount(period.opening_balance)}
          {period.opening_balance_source ? ` (${period.opening_balance_source})` : ""}
          {" · "}
          Close {period.closing_balance == null ? "—" : formatAmount(period.closing_balance)}
        </span>
      </div>

      <div className={styles.rowActions}>
        {caps.approveLock &&
          transitions.map((to) => (
            <button
              key={to}
              className={styles.btnSmGhost}
              disabled={pending}
              onClick={() => run(() => transitionPeriodAction({ companyId, periodId: period.id, to }))}
            >
              → {PERIOD_STATUS_LABEL[to]}
            </button>
          ))}

        {caps.setOpening && (
          obOpen ? (
            <form
              className={styles.inlineForm}
              onSubmit={(e) => {
                e.preventDefault();
                run(() => setOpeningBalanceAction({ companyId, periodId: period.id, amount: Number(ob) }));
                setObOpen(false);
              }}
            >
              <input
                className={styles.numInput}
                type="number"
                step="0.01"
                value={ob}
                onChange={(e) => setOb(e.target.value)}
                placeholder="Opening balance"
                autoFocus
              />
              <button className={styles.btnSm} type="submit" disabled={pending}>Save</button>
              <button className={styles.btnSmGhost} type="button" onClick={() => setObOpen(false)}>Cancel</button>
            </form>
          ) : (
            <button className={styles.btnSmGhost} disabled={pending} onClick={() => setObOpen(true)}>
              Set opening
            </button>
          )
        )}

        {caps.correction && (
          period.is_correction_mode ? (
            <button
              className={styles.btnSmGhost}
              disabled={pending}
              onClick={() =>
                run(() => setCorrectionModeAction({ companyId, periodId: period.id, on: false, reason: "" }))
              }
            >
              Exit correction
            </button>
          ) : reasonOpen ? (
            <form
              className={styles.inlineForm}
              onSubmit={(e) => {
                e.preventDefault();
                run(() => setCorrectionModeAction({ companyId, periodId: period.id, on: true, reason }));
                setReasonOpen(false);
                setReason("");
              }}
            >
              <input
                className={styles.textInput}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (required)"
                autoFocus
              />
              <button className={styles.btnSm} type="submit" disabled={pending || !reason.trim()}>
                Enable
              </button>
              <button className={styles.btnSmGhost} type="button" onClick={() => setReasonOpen(false)}>Cancel</button>
            </form>
          ) : (
            (period.status === "locked" || period.status === "closed") && (
              <button className={styles.btnSmGhost} disabled={pending} onClick={() => setReasonOpen(true)}>
                Correction Mode
              </button>
            )
          )
        )}
      </div>
    </div>
  );
}
