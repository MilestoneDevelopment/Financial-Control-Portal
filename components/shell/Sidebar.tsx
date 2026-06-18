"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS } from "@/lib/nav";
import styles from "./shell.module.css";

/**
 * Dark sidebar: brand wordmark + cyan-bar mark, company switcher (placeholder
 * in Phase 0), grouped nav. Active item is derived from the current path.
 */
export function Sidebar({ companyId }: { companyId: string }) {
  const pathname = usePathname();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.brandMark} aria-hidden />
        <div>
          <div className={styles.brandName}>Financial Control Portal</div>
          <div className={styles.brandSub}>Internal Finance Platform</div>
        </div>
      </div>

      <div className={styles.switcher} title="Company switcher (wired in Phase 1)">
        <span className={styles.switcherInit}>TH</span>
        <span className={styles.switcherName}>Tsavkisi Holdings</span>
        <span className={styles.switcherCaret}>▾</span>
      </div>

      <nav className={styles.nav}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className={styles.navGroup}>
            <div className={styles.navGroupLabel}>{group.label}</div>
            {group.items.map((item) => {
              const href = item.href(companyId);
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
