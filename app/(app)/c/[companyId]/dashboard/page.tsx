import { TopBar } from "@/components/shell/TopBar";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { capabilityMap } from "@/lib/auth/guards";
import { listPeriods } from "@/lib/data/periods";
import { PeriodsPanel, type PeriodLite } from "./PeriodsPanel";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;

  let periods: PeriodLite[] = [];
  let caps = { approveLock: false, correction: false, setOpening: false };

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const c = await capabilityMap(supabase, companyId, [
      "period.approve_lock",
      "period.correction_mode",
      "period.set_opening_balance",
    ]);
    caps = {
      approveLock: c["period.approve_lock"],
      correction: c["period.correction_mode"],
      setOpening: c["period.set_opening_balance"],
    };
    periods = (await listPeriods(companyId)).map((p) => ({
      id: p.id,
      year: p.year,
      month: p.month,
      status: p.status,
      is_correction_mode: p.is_correction_mode,
      correction_reason: p.correction_reason,
      opening_balance: p.opening_balance,
      closing_balance: p.closing_balance,
      opening_balance_source: p.opening_balance_source,
    }));
  }

  return (
    <>
      <TopBar
        title="Dashboard"
        subtitle="Company overview - period lifecycle (KPIs & charts arrive in Phase 6)"
      />
      <div className={styles.pageBody}>
        <PeriodsPanel companyId={companyId} periods={periods} caps={caps} />
      </div>
    </>
  );
}
