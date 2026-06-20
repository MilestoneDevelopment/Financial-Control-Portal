"use client";

import { useState, useTransition } from "react";
import {
  createPeriodAction,
  setOpeningBalanceAction,
  acceptCarriedOpeningAction,
} from "./actions";
import styles from "./cash-flow.module.css";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function useRun() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<void>) => {
    setError(null);
    start(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed.");
      }
    });
  };
  return { pending, error, run };
}

/** Compact create-a-period control (capability: period.approve_lock). */
export function CreatePeriodForm({ companyId }: { companyId: string }) {
  const { pending, error, run } = useRun();
  const [year, setYear] = useState<string>("2026");
  const [month, setMonth] = useState<string>(""); // "" = full year

  return (
    <div className={styles.setupCard}>
      <div className={styles.setupTitle}>Period setup</div>
      <form
        className={styles.setupForm}
        onSubmit={(e) => {
          e.preventDefault();
          run(() =>
            createPeriodAction({
              companyId,
              year: Number(year),
              month: month === "" ? null : Number(month),
            }),
          );
        }}
      >
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Year</span>
          <input
            className={`${styles.input} ${styles.yearInput}`}
            type="number"
            min={2000}
            max={2100}
            value={year}
            disabled={pending}
            onChange={(e) => setYear(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Month</span>
          <select
            className={styles.select}
            value={month}
            disabled={pending}
            onChange={(e) => setMonth(e.target.value)}
          >
            <option value="">Full year</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </label>
        <button type="submit" className={styles.btnSm} disabled={pending}>
          {pending ? "Creating..." : "Create period"}
        </button>
      </form>
      {error && <div className={styles.controlError}>{error}</div>}
    </div>
  );
}

/** Opening-balance controls inside the balance card (period.set_opening_balance). */
export function OpeningBalanceForm({
  companyId,
  periodId,
  hasValue,
  candidate,
}: {
  companyId: string;
  periodId: string;
  hasValue: boolean;
  candidate: number | null;
}) {
  const { pending, error, run } = useRun();
  const [amount, setAmount] = useState<string>("");

  return (
    <div className={styles.obForm}>
      {candidate !== null && (
        <button
          type="button"
          className={styles.btnSm}
          disabled={pending}
          onClick={() => run(() => acceptCarriedOpeningAction({ companyId, periodId }))}
        >
          {pending ? "Working..." : `Accept carried opening ${formatInline(candidate)}`}
        </button>
      )}
      <form
        className={styles.obRow}
        onSubmit={(e) => {
          e.preventDefault();
          run(() => setOpeningBalanceAction({ companyId, periodId, amount: Number(amount) }));
        }}
      >
        <input
          className={`${styles.input} ${styles.obInput}`}
          type="number"
          step="0.01"
          placeholder={hasValue ? "New amount" : "Set amount"}
          value={amount}
          disabled={pending}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button type="submit" className={styles.btnSmGhost} disabled={pending || amount === ""}>
          {hasValue ? "Update" : "Set manual"}
        </button>
      </form>
      {error && <div className={styles.controlError}>{error}</div>}
    </div>
  );
}

/** Bare accounting format for inline button copy (parentheses for negatives). */
function formatInline(n: number): string {
  const neg = n < 0;
  const body = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return neg ? `(${body})` : body;
}
