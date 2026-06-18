"use client";

import { useState, useTransition } from "react";
import { ensureActiveVersionAction } from "./actions";
import styles from "./structure.module.css";

export function InitStructure({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className={styles.initCard}>
      <div className={styles.initTitle}>No structure yet</div>
      <p className={styles.initText}>
        Create the first cash-flow structure version for this company, then build its
        sections, groups and classes. Historical locked periods will keep the version
        they were generated against.
      </p>
      {error && <div className={styles.error}>{error}</div>}
      {canEdit ? (
        <button
          className={styles.btn}
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                await ensureActiveVersionAction(companyId);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to initialize structure.");
              }
            });
          }}
        >
          {pending ? "Creating…" : "Initialize structure (v1)"}
        </button>
      ) : (
        <div className={styles.readonly}>
          You do not have permission to create the structure (requires Edit cash flow structure).
        </div>
      )}
    </div>
  );
}
