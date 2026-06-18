"use client";

import { TopBar } from "./TopBar";
import styles from "./shell.module.css";

/**
 * Phase 0 stub for a module screen: renders the real top bar (live period +
 * currency) plus a placeholder card noting which phase delivers the feature.
 * Replaced module-by-module in later phases.
 */
export function ModulePlaceholder({
  title,
  subtitle,
  phase,
  usesPeriod = true,
}: {
  title: string;
  subtitle?: string;
  phase: string;
  usesPeriod?: boolean;
}) {
  return (
    <>
      <TopBar title={title} subtitle={subtitle} usesPeriod={usesPeriod} />
      <div className={styles.content}>
        <div className={styles.placeholder}>
          <span className={styles.placeholderMark} aria-hidden />
          <div className={styles.placeholderTitle}>{title}</div>
          <p className={styles.placeholderText}>
            Foundation in place. This module is delivered in <strong>{phase}</strong>.
          </p>
        </div>
      </div>
    </>
  );
}
