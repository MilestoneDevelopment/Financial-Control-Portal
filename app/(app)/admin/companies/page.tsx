import Link from "next/link";
import { TopBar } from "@/components/shell/TopBar";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { canOrg, getUserOrgId } from "@/lib/auth/guards";
import { listAccessibleCompanies } from "@/lib/data/companies";
import { AdminCompanies, type CompanyRow } from "./AdminCompanies";
import styles from "./admin.module.css";

export const dynamic = "force-dynamic";

export default async function AdminCompaniesPage() {
  let companies: CompanyRow[] = [];
  let canAdd = false;
  let canManage = false;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const orgId = await getUserOrgId(supabase);
    if (orgId) {
      canAdd = await canOrg(supabase, "companies.add", orgId);
      canManage = await canOrg(supabase, "companies.manage", orgId);
    }
    companies = (await listAccessibleCompanies()).map((c) => ({
      id: c.id,
      name: c.name,
      short_code: c.short_code,
      base_currency: c.base_currency,
      status: c.status,
      in_portfolio: c.in_portfolio,
    }));
  }

  return (
    <>
      <TopBar
        title="Companies"
        subtitle="Manage companies and per-company base currency"
        usesPeriod={false}
      />
      <div className={styles.pageBody}>
        <Link href="/admin" className={styles.back}>← Admin Console</Link>
        <AdminCompanies companies={companies} canAdd={canAdd} canManage={canManage} />
      </div>
    </>
  );
}
