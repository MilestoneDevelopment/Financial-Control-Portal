"use client";

import { useCurrency } from "@/components/providers/CurrencyProvider";
import styles from "./shell.module.css";

/** GEL / USD display toggle. GEL is default; USD converts via FX (Phase 7). */
export function CurrencyToggle() {
  const { currency, setCurrency } = useCurrency();
  return (
    <div className={styles.curToggle} role="group" aria-label="Display currency">
      {(["GEL", "USD"] as const).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => setCurrency(c)}
          className={`${styles.curBtn} ${currency === c ? styles.curBtnOn : ""}`}
          aria-pressed={currency === c}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
