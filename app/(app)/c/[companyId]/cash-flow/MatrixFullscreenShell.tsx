"use client";

import { useEffect, useState, type ReactNode } from "react";
import styles from "./cash-flow.module.css";

/**
 * Wraps a Matrix table with an "Expand table" affordance. The table renders
 * inline as usual; clicking Expand opens a full-screen overlay that re-renders
 * the same table node with more width/height. No data is refetched and no
 * calculations change - the overlay copy is an independent render of the same
 * already-computed model. Escape or the Close button dismisses it.
 */
export function MatrixFullscreenShell({
  title,
  modeLabel,
  children,
}: {
  title: string;
  modeLabel: string;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [expanded]);

  return (
    <>
      <div className={styles.matrixCardHead}>
        <span className={styles.cardTitle}>{title}</span>
        <button
          type="button"
          className={styles.btnSmGhost}
          onClick={() => setExpanded(true)}
        >
          Expand table
        </button>
      </div>

      {children}

      {expanded && (
        <div
          className={styles.fsBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={`${title} - ${modeLabel}`}
          onClick={(e) => {
            // Click on the backdrop (outside the panel) closes.
            if (e.target === e.currentTarget) setExpanded(false);
          }}
        >
          <div className={styles.fsPanel}>
            <div className={styles.fsHeader}>
              <span className={styles.fsTitle}>
                {title}
                <span className={styles.fsMode}>{modeLabel}</span>
              </span>
              <button type="button" className={styles.btnSm} onClick={() => setExpanded(false)}>
                Close
              </button>
            </div>
            <div className={styles.fsBody}>{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
