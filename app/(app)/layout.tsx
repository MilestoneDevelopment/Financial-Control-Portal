import { redirect } from "next/navigation";
import { ShellFrame } from "@/components/shell/ShellFrame";
import type { CompanyLite } from "@/components/providers/AppInfoProvider";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { listAccessibleCompanies, pickDefaultCompany } from "@/lib/data/companies";

// Protected app area is always request-rendered (reads auth cookies).
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let email = "demo@local";
  let companies: CompanyLite[] = [];
  let defaultCompanyId: string | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    email = user.email ?? "unknown";

    const rows = await listAccessibleCompanies();
    companies = rows.map((c) => ({
      id: c.id,
      name: c.name,
      short_code: c.short_code,
      base_currency: c.base_currency,
      status: c.status,
    }));
    defaultCompanyId = pickDefaultCompany(rows)?.id ?? null;
  }

  return (
    <ShellFrame email={email} companies={companies} defaultCompanyId={defaultCompanyId}>
      {children}
    </ShellFrame>
  );
}
