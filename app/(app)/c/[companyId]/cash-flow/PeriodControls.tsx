"use client";

import { useState, useTransition } from "react";
import {
  setOpeningBalanceAction,
  acceptCarriedOpeningAction,
} from "./actions";
import styles from "./cash-flow.module.css";

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
