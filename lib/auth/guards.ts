import "server-only";

/**
 * Server-side auth + capability guards. RLS is the hard enforcement layer;
 * these give friendly errors and drive UI gating. Capability checks delegate to
 * the DB `auth_can` / `auth_can_org` functions so role_permissions overrides are
 * honored (single source of truth).
 */
import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/db/types";
import type { CapabilityKey } from "@/lib/permissions/capabilities";
import { createClient } from "@/lib/supabase/server";

export async function getUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/** The current user's org id (single-org MVP returns the first). */
export async function getUserOrgId(
  supabase: SupabaseClient<Database>,
): Promise<string | null> {
  const { data } = await supabase.rpc("auth_org_ids");
  return data && data.length > 0 ? data[0] : null;
}

export async function can(
  supabase: SupabaseClient<Database>,
  capability: CapabilityKey,
  companyId: string,
): Promise<boolean> {
  const { data } = await supabase.rpc("auth_can", {
    cap: capability,
    p_company: companyId,
  });
  return data === true;
}

export async function canOrg(
  supabase: SupabaseClient<Database>,
  capability: CapabilityKey,
  orgId: string,
): Promise<boolean> {
  const { data } = await supabase.rpc("auth_can_org", {
    cap: capability,
    p_org: orgId,
  });
  return data === true;
}

export async function requireCapability(
  supabase: SupabaseClient<Database>,
  capability: CapabilityKey,
  companyId: string,
): Promise<void> {
  if (!(await can(supabase, capability, companyId))) {
    throw new Error(`Not authorized (${capability}).`);
  }
}

export async function requireCapabilityOrg(
  supabase: SupabaseClient<Database>,
  capability: CapabilityKey,
  orgId: string,
): Promise<void> {
  if (!(await canOrg(supabase, capability, orgId))) {
    throw new Error(`Not authorized (${capability}).`);
  }
}

/** Resolve a set of capability booleans for one company in a single pass (UI gating). */
export async function capabilityMap(
  supabase: SupabaseClient<Database>,
  companyId: string,
  capabilities: CapabilityKey[],
): Promise<Record<string, boolean>> {
  const results = await Promise.all(
    capabilities.map((c) => can(supabase, c, companyId)),
  );
  return Object.fromEntries(capabilities.map((c, i) => [c, results[i]]));
}
