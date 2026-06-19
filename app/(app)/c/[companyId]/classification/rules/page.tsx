import Link from "next/link";
import { TopBar } from "@/components/shell/TopBar";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { capabilityMap } from "@/lib/auth/guards";
import { listActiveClasses, listAllRules } from "@/lib/data/classification";
import { RulesClient, type RuleListItem } from "./RulesClient";
import styles from "../classification.module.css";

export const dynamic = "force-dynamic";

export default async function RulesPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;

  let canManageRules = false;
  let canRun = false;
  let classes: { id: string; label: string; cashDirection: string }[] = [];
  let rules: RuleListItem[] = [];

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const caps = await capabilityMap(supabase, companyId, ["classification.manage_rules", "classification.run"]);
    canManageRules = caps["classification.manage_rules"];
    canRun = caps["classification.run"];
    classes = await listActiveClasses(companyId);
    rules = (await listAllRules(companyId)).map((r) => ({
      id: r.id,
      name: r.name,
      classId: r.class_id,
      ruleType: r.rule_type,
      priority: r.priority,
      confidenceScore: Number(r.confidence_score),
      isActive: r.is_active,
      debitAccountPattern: r.debit_account_pattern,
      creditAccountPattern: r.credit_account_pattern,
      descriptionPattern: r.description_pattern,
      currency: r.currency,
      minAmount: r.min_amount !== null ? Number(r.min_amount) : null,
      maxAmount: r.max_amount !== null ? Number(r.max_amount) : null,
      cashDirection: r.cash_direction,
      updatedAt: r.updated_at,
    }));
  }

  return (
    <>
      <TopBar title="Classification Rules" subtitle="Create and manage rules that auto-classify transactions" usesPeriod={false} />
      <div className={styles.pageBody}>
        <Link href={`/c/${companyId}/classification`} className={styles.back}>← Classification</Link>
        <RulesClient
          companyId={companyId}
          canManageRules={canManageRules}
          canRun={canRun}
          classes={classes}
          rules={rules}
        />
      </div>
    </>
  );
}
