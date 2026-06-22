import { TopBar } from "@/components/shell/TopBar";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { capabilityMap } from "@/lib/auth/guards";
import {
  getActiveVersion,
  getNodes,
  buildNodeTree,
  validateTree,
  countTree,
} from "@/lib/data/structure";
import { StructureBuilder } from "./StructureBuilder";
import { InitStructure } from "./InitStructure";
import styles from "./structure.module.css";

export const dynamic = "force-dynamic";

export default async function StructurePage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;

  let canEdit = false;
  let hasVersion = false;
  let versionId = "";
  let tree: ReturnType<typeof buildNodeTree> = [];
  let issues: ReturnType<typeof validateTree> = [];
  let counts = { sections: 0, groups: 0, classes: 0, active: 0, inactive: 0 };

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    canEdit = (await capabilityMap(supabase, companyId, ["structure.edit"]))["structure.edit"];
    // Company-scoped: the active version (and its nodes) are loaded strictly by
    // the route company id; force-dynamic refetches per request, so switching
    // company never reuses another company's structure.
    const version = await getActiveVersion(companyId);
    if (version) {
      hasVersion = true;
      versionId = version.id;
      const nodes = await getNodes(version.id);
      tree = buildNodeTree(nodes);
      issues = validateTree(tree);
      counts = countTree(tree);
    }
  }

  return (
    <>
      <TopBar
        title="Cash Flow Structure"
        subtitle="Manage sections, groups and classes (versioned)"
        usesPeriod={false}
      />
      <div className={styles.pageBody}>
        {hasVersion ? (
          <StructureBuilder
            companyId={companyId}
            versionId={versionId}
            tree={tree}
            issues={issues}
            counts={counts}
            canEdit={canEdit}
          />
        ) : (
          <InitStructure companyId={companyId} canEdit={canEdit} />
        )}
      </div>
    </>
  );
}
