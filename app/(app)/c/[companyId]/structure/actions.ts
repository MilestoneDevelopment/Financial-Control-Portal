"use server";

/**
 * Structure Builder server actions. Every mutation is capability-gated
 * (structure.edit), audit-logged, and revalidates the structure page.
 * RLS independently enforces the same capability at the database.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { getCompany } from "@/lib/data/companies";
import type { Database } from "@/db/types";

type CfNodeKind = Database["public"]["Enums"]["cf_node_kind"];
type CashDirection = Database["public"]["Enums"]["cash_direction"];

async function orgIdFor(companyId: string): Promise<string> {
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found.");
  return company.org_id;
}

/**
 * Confirm a node belongs to the route company before editing it. RLS already
 * gates writes by structure.edit on the node's own company, but this prevents a
 * crafted node id from another company being edited via the current page (the
 * action's companyId/permission check would otherwise pass for a multi-company
 * user). Reads are RLS-scoped to accessible companies.
 */
async function assertNodeInCompany(
  supabase: Awaited<ReturnType<typeof createClient>>,
  nodeId: string,
  companyId: string,
): Promise<void> {
  const { data } = await supabase
    .from("cf_nodes")
    .select("company_id")
    .eq("id", nodeId)
    .maybeSingle();
  if (!data || data.company_id !== companyId) {
    throw new Error("Node not found for this company.");
  }
}

/** Confirm a structure version belongs to the route company. */
async function assertVersionInCompany(
  supabase: Awaited<ReturnType<typeof createClient>>,
  versionId: string,
  companyId: string,
): Promise<void> {
  const { data } = await supabase
    .from("cf_structure_versions")
    .select("company_id")
    .eq("id", versionId)
    .maybeSingle();
  if (!data || data.company_id !== companyId) {
    throw new Error("Structure version not found for this company.");
  }
}

function revalidate(companyId: string) {
  revalidatePath(`/c/${companyId}/structure`);
}

/** Create the initial active structure version (v1) if none exists. */
export async function ensureActiveVersionAction(companyId: string): Promise<void> {
  const supabase = await createClient();
  await requireCapability(supabase, "structure.edit", companyId);

  const { data: existing } = await supabase
    .from("cf_structure_versions")
    .select("id")
    .eq("company_id", companyId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (existing) return;

  const orgId = await orgIdFor(companyId);
  const { error } = await supabase.from("cf_structure_versions").insert({
    company_id: companyId,
    version_no: 1,
    label: "Initial structure",
    status: "active",
  });
  if (error) throw new Error(error.message);
  await logAudit(supabase, {
    orgId,
    companyId,
    action: "structure.version.created",
    target: "v1",
  });
  revalidate(companyId);
}

export async function addNodeAction(input: {
  companyId: string;
  versionId: string;
  kind: CfNodeKind;
  label: string;
  parentId: string | null;
  cashDirection?: CashDirection;
}): Promise<void> {
  const label = input.label.trim();
  if (!label) throw new Error("Label is required.");

  const supabase = await createClient();
  await requireCapability(supabase, "structure.edit", input.companyId);
  // Company scoping: version (and parent, if any) must belong to this company.
  await assertVersionInCompany(supabase, input.versionId, input.companyId);
  if (input.parentId) await assertNodeInCompany(supabase, input.parentId, input.companyId);
  const orgId = await orgIdFor(input.companyId);

  // sort_order = number of existing siblings (append to end)
  let q = supabase
    .from("cf_nodes")
    .select("*", { count: "exact", head: true })
    .eq("structure_version_id", input.versionId);
  q = input.parentId ? q.eq("parent_id", input.parentId) : q.is("parent_id", null);
  const { count } = await q;

  const { error } = await supabase.from("cf_nodes").insert({
    company_id: input.companyId,
    structure_version_id: input.versionId,
    parent_id: input.parentId,
    kind: input.kind,
    label,
    sort_order: count ?? 0,
    cash_direction: input.kind === "class" ? input.cashDirection ?? "neutral" : "neutral",
  });
  if (error) throw new Error(error.message);
  await logAudit(supabase, {
    orgId,
    companyId: input.companyId,
    action: "structure.node.created",
    target: label,
    details: { kind: input.kind, parentId: input.parentId },
  });
  revalidate(input.companyId);
}

export async function updateNodeAction(input: {
  companyId: string;
  nodeId: string;
  label?: string;
  cashDirection?: CashDirection;
  dept?: string | null;
}): Promise<void> {
  const supabase = await createClient();
  await requireCapability(supabase, "structure.edit", input.companyId);
  await assertNodeInCompany(supabase, input.nodeId, input.companyId);
  const orgId = await orgIdFor(input.companyId);

  const patch: Database["public"]["Tables"]["cf_nodes"]["Update"] = {};
  if (input.label !== undefined) {
    const label = input.label.trim();
    if (!label) throw new Error("Label cannot be empty.");
    patch.label = label;
  }
  if (input.cashDirection !== undefined) patch.cash_direction = input.cashDirection;
  if (input.dept !== undefined) patch.dept = input.dept;

  const { error } = await supabase.from("cf_nodes").update(patch).eq("id", input.nodeId);
  if (error) throw new Error(error.message);
  await logAudit(supabase, {
    orgId,
    companyId: input.companyId,
    action: "structure.node.updated",
    target: input.nodeId,
    details: patch as Record<string, unknown>,
  });
  revalidate(input.companyId);
}

export async function setNodeActiveAction(input: {
  companyId: string;
  nodeId: string;
  active: boolean;
}): Promise<void> {
  const supabase = await createClient();
  await requireCapability(supabase, "structure.edit", input.companyId);
  await assertNodeInCompany(supabase, input.nodeId, input.companyId);
  const orgId = await orgIdFor(input.companyId);

  const { error } = await supabase
    .from("cf_nodes")
    .update({ is_active: input.active })
    .eq("id", input.nodeId);
  if (error) throw new Error(error.message);
  await logAudit(supabase, {
    orgId,
    companyId: input.companyId,
    action: input.active ? "structure.node.activated" : "structure.node.deactivated",
    target: input.nodeId,
  });
  revalidate(input.companyId);
}
