"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./cash-flow.module.css";

/**
 * Wraps a Matrix table with an "Expand table" affordance. The table renders
 * inline as usual; clicking Expand opens a full-screen overlay that re-renders
 * the same table node with more width/height. No data is refetched and no
 * calculations change - the overlay copy is an independent render of the same
 * already-computed model. Escape, the Close button, or a backdrop click
 * dismisses it. While open, focus is moved into the dialog and trapped, body
 * scroll is locked, and focus returns to the trigger on close.
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const trigger = triggerRef.current;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Move focus into the dialog (Close button) once it has rendered.
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExpanded(false);
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      // Trap Tab focus inside the dialog (loop at both ends).
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      // Restore focus to the trigger after closing.
      trigger?.focus();
    };
  }, [expanded]);

  return (
    <>
      <div className={styles.matrixCardHead}>
        <span className={styles.cardTitle}>{title}</span>
        <button
          type="button"
          ref={triggerRef}
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
          <div className={styles.fsPanel} ref={panelRef}>
            <div className={styles.fsHeader}>
              <span className={styles.fsTitle}>
                {title}
                <span className={styles.fsMode}>{modeLabel}</span>
              </span>
              <button type="button" ref={closeRef} className={styles.btnSm} onClick={() => setExpanded(false)}>
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
