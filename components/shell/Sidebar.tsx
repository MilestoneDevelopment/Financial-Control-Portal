"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAV_GROUPS, PORTFOLIO_ALLOWED } from "@/lib/nav";
import { useAppInfo } from "@/components/providers/AppInfoProvider";
import styles from "./shell.module.css";

function activeCompanyFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/c\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { companies, defaultCompanyId } = useAppInfo();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  const portfolioMode = pathname.startsWith("/portfolio");
  const urlCompany = activeCompanyFromPath(pathname);
  const activeCompanyId = urlCompany ?? defaultCompanyId;
  const activeCompany = companies.find((c) => c.id === activeCompanyId) ?? null;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function switchCompany(id: string) {
    setSwitcherOpen(false);
    router.push(`/c/${id}/dashboard`);
  }

  const switcherLabel = portfolioMode
    ? "All Companies"
    : activeCompany?.name ?? "Select a company";

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.brandMark} aria-hidden />
        <div>
          <div className={styles.brandName}>Financial Control Portal</div>
          <div className={styles.brandSub}>Internal Finance Platform</div>
        </div>
      </div>

      <div className={styles.switcher} ref={switcherRef}>
        <button
          type="button"
          className={styles.switcherBtn}
          onClick={() => setSwitcherOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={switcherOpen}
        >
          <span className={styles.switcherInit}>
            {portfolioMode ? "▦" : activeCompany ? initials(activeCompany.name) : "··"}
          </span>
          <span className={styles.switcherName}>{switcherLabel}</span>
          <span className={styles.switcherCaret}>▾</span>
        </button>
        {switcherOpen && (
          <div className={styles.switcherMenu} role="menu">
            <Link
              href="/portfolio"
              className={`${styles.switcherItem} ${portfolioMode ? styles.switcherItemActive : ""}`}
              onClick={() => setSwitcherOpen(false)}
            >
              ▦ All Companies (Portfolio)
            </Link>
            <div className={styles.switcherDivider} />
            {companies.length === 0 && (
              <div className={styles.switcherEmpty}>No companies yet</div>
            )}
            {companies.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`${styles.switcherItem} ${
                  !portfolioMode && c.id === activeCompanyId ? styles.switcherItemActive : ""
                }`}
                onClick={() => switchCompany(c.id)}
                role="menuitem"
              >
                <span className={styles.switcherDot}>{initials(c.name)}</span>
                {c.name}
                {c.status !== "active" && <span className={styles.switcherTag}>{c.status}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className={styles.nav}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className={styles.navGroup}>
            <div className={styles.navGroupLabel}>{group.label}</div>
            {group.items.map((item) => {
              const isCompanyScoped = item.scope === "company";
              const disabledPortfolio = portfolioMode && !PORTFOLIO_ALLOWED.has(item.key);
              const disabledNoCompany = isCompanyScoped && !activeCompanyId;
              const disabled = disabledPortfolio || disabledNoCompany;

              if (disabled) {
                const title = disabledPortfolio
                  ? "Select a specific company to access this workspace."
                  : "No company available.";
                return (
                  <span
                    key={item.key}
                    className={`${styles.navItem} ${styles.navItemDisabled}`}
                    title={title}
                  >
                    {item.label}
                  </span>
                );
              }

              const href = item.href(activeCompanyId ?? "");
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={item.key}
                  href={href}
                  className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
