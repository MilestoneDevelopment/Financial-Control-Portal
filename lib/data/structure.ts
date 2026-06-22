import "server-only";

/**
 * Cash-flow structure read queries. Pure tree/validation helpers live in
 * lib/domain/structure/tree.ts and are re-exported here for convenience.
 */
import type { Database } from "@/db/types";
import { createClient } from "@/lib/supabase/server";

export type StructureVersion =
  Database["public"]["Tables"]["cf_structure_versions"]["Row"];

export type { CfNode, TreeSection, TreeGroup, TreeNode, TreeCounts, StructureIssue } from "@/lib/domain/structure/tree";
export { buildTree, validateStructure, countNodes, buildNodeTree, countTree, validateTree } from "@/lib/domain/structure/tree";

import type { CfNode } from "@/lib/domain/structure/tree";

/** The company's active structure version, or null if none yet. */
export async function getActiveVersion(
  companyId: string,
): Promise<StructureVersion | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cf_structure_versions")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function getNodes(versionId: string): Promise<CfNode[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cf_nodes")
    .select("*")
    .eq("structure_version_id", versionId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
