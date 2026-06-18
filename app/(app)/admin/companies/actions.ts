"use server";

/**
 * Admin company management (foundation). Org-level capability gated
 * (companies.add / companies.manage), audited, and RLS-enforced.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrgId, requireCapabilityOrg } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { getCompany } from "@/lib/data/companies";
import type { Database } from "@/db/types";

type Currency = Database["public"]["Enums"]["currency"];
type CompanyStatus = Database["public"]["Enums"]["company_status"];

export async function createCompanyAction(input: {
  name: string;
  shortCode: string;
  baseCurrency: Currency;
  inPortfolio: boolean;
}): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new Error("Company name is required.");

  const supabase = await createClient();
  const orgId = await getUserOrgId(supabase);
  if (!orgId) throw new Error("No organization found for the current user.");
  await requireCapabilityOrg(supabase, "companies.add", orgId);

  const { error } = await supabase.from("companies").insert({
    org_id: orgId,
    name,
    short_code: input.shortCode.trim() || null,
    base_currency: input.baseCurrency,
    in_portfolio: input.inPortfolio,
    status: "draft",
  });
  if (error) throw new Error(error.message);
  await logAudit(supabase, { orgId, action: "company.created", target: name });
  revalidatePath("/admin/companies");
}

export async function updateCompanyAction(input: {
  companyId: string;
  name?: string;
  baseCurrency?: Currency;
  status?: CompanyStatus;
  inPortfolio?: boolean;
}): Promise<void> {
  const supabase = await createClient();
  const company = await getCompany(input.companyId);
  if (!company) throw new Error("Company not found.");
  await requireCapabilityOrg(supabase, "companies.manage", company.org_id);

  const patch: Database["public"]["Tables"]["companies"]["Update"] = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Company name cannot be empty.");
    patch.name = name;
  }
  if (input.baseCurrency !== undefined) patch.base_currency = input.baseCurrency;
  if (input.status !== undefined) patch.status = input.status;
  if (input.inPortfolio !== undefined) patch.in_portfolio = input.inPortfolio;

  const { error } = await supabase.from("companies").update(patch).eq("id", input.companyId);
  if (error) throw new Error(error.message);
  await logAudit(supabase, {
    orgId: company.org_id,
    companyId: input.companyId,
    action: "company.updated",
    target: company.name,
    details: patch as Record<string, unknown>,
  });
  revalidatePath("/admin/companies");
}
