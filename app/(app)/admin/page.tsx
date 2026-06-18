import Link from "next/link";
import { TopBar } from "@/components/shell/TopBar";
import styles from "./admin.hub.module.css";

export const dynamic = "force-dynamic";

const TABS = [
  { label: "Companies", href: "/admin/companies", phase: "Phase 1", ready: true },
  { label: "Users", href: "/admin", phase: "Phase 8", ready: false },
  { label: "Roles", href: "/admin", phase: "Phase 8", ready: false },
  { label: "Company Access", href: "/admin", phase: "Phase 8", ready: false },
  { label: "Invitations", href: "/admin", phase: "Phase 8", ready: false },
  { label: "Audit Log", href: "/admin", phase: "Phase 8", ready: false },
  { label: "Security Settings", href: "/admin", phase: "Phase 8", ready: false },
];

export default function AdminPage() {
  return (
    <>
      <TopBar
        title="Admin Console"
        subtitle="Users, roles, company access, invitations, audit log and security"
        usesPeriod={false}
      />
      <div className={styles.pageBody}>
        <div className={styles.grid}>
          {TABS.map((t) =>
            t.ready ? (
              <Link key={t.label} href={t.href} className={styles.card}>
                <div className={styles.cardLabel}>{t.label}</div>
                <div className={styles.cardPhaseReady}>Available</div>
              </Link>
            ) : (
              <div key={t.label} className={`${styles.card} ${styles.cardDisabled}`}>
                <div className={styles.cardLabel}>{t.label}</div>
                <div className={styles.cardPhase}>{t.phase}</div>
              </div>
            ),
          )}
        </div>
      </div>
    </>
  );
}
