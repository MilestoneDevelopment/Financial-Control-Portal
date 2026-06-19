"use client";

import { useState, useTransition } from "react";
import { createCompanyAction, updateCompanyAction } from "./actions";
import styles from "./admin.module.css";

type Currency = "GEL" | "USD" | "EUR";
type CompanyStatus = "draft" | "active" | "archived";

export interface CompanyRow {
  id: string;
  name: string;
  short_code: string | null;
  base_currency: Currency;
  status: CompanyStatus;
  in_portfolio: boolean;
}

export function AdminCompanies({
  companies,
  canAdd,
  canManage,
}: {
  companies: CompanyRow[];
  canAdd: boolean;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // create form
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [cur, setCur] = useState<Currency>("GEL");
  const [inPortfolio, setInPortfolio] = useState(true);

  function run(fn: () => Promise<void>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        after?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed.");
      }
    });
  }

  return (
    <div className={styles.wrap}>
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Company</th>
              <th>Code</th>
              <th>Base currency</th>
              <th>Status</th>
              <th>Portfolio</th>
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 && (
              <tr>
                <td colSpan={5} className={styles.empty}>No companies yet.</td>
              </tr>
            )}
            {companies.map((c) => (
              <tr key={c.id}>
                <td className={styles.name}>{c.name}</td>
                <td className={styles.muted}>{c.short_code ?? "-"}</td>
                <td>
                  <select
                    className={styles.select}
                    value={c.base_currency}
                    disabled={!canManage || pending}
                    onChange={(e) =>
                      run(() => updateCompanyAction({ companyId: c.id, baseCurrency: e.target.value as Currency }))
                    }
                  >
                    <option value="GEL">GEL</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </td>
                <td>
                  <select
                    className={styles.select}
                    value={c.status}
                    disabled={!canManage || pending}
                    onChange={(e) =>
                      run(() => updateCompanyAction({ companyId: c.id, status: e.target.value as CompanyStatus }))
                    }
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </td>
                <td>
                  <button
                    className={styles.toggle}
                    disabled={!canManage || pending}
                    data-on={c.in_portfolio ? "1" : "0"}
                    onClick={() =>
                      run(() => updateCompanyAction({ companyId: c.id, inPortfolio: !c.in_portfolio }))
                    }
                  >
                    {c.in_portfolio ? "Included" : "Excluded"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canAdd && (
        <form
          className={styles.createCard}
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => createCompanyAction({ name, shortCode: code, baseCurrency: cur, inPortfolio }),
              () => {
                setName("");
                setCode("");
                setCur("GEL");
                setInPortfolio(true);
              },
            );
          }}
        >
          <div className={styles.createTitle}>Add company</div>
          <div className={styles.createRow}>
            <input
              className={styles.input}
              placeholder="Company name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className={styles.input}
              placeholder="Code (e.g. TSV-001)"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <select className={styles.select} value={cur} onChange={(e) => setCur(e.target.value as Currency)}>
              <option value="GEL">GEL</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={inPortfolio}
                onChange={(e) => setInPortfolio(e.target.checked)}
              />
              In portfolio
            </label>
            <button className={styles.btn} type="submit" disabled={pending || !name.trim()}>
              Create
            </button>
          </div>
        </form>
      )}

      {!canManage && !canAdd && (
        <div className={styles.readonly}>Read-only - company management requires Admin access.</div>
      )}
    </div>
  );
}
