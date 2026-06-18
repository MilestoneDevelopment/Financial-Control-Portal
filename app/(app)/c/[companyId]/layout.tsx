import { notFound } from "next/navigation";
import { getCompany } from "@/lib/data/companies";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

/**
 * Validates that the current user can access this company. RLS scopes
 * getCompany to accessible rows, so an unknown/forbidden id returns null -> 404.
 */
export default async function CompanyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  if (isSupabaseConfigured()) {
    const company = await getCompany(companyId);
    if (!company) notFound();
  }
  return <>{children}</>;
}
