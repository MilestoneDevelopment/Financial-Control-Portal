/**
 * Service-role org provisioning (ops tooling - NOT exposed to the app/client).
 *
 * Creates an organization, then calls seed_org_defaults() to install the system
 * roles, default permissions, security settings, and the Owner membership for an
 * existing user. seed_org_defaults EXECUTE is granted only to service_role
 * (migration 0002), so this must run with the service-role key.
 *
 * Prerequisites: the owner must have already signed up (a profiles row exists,
 * created by the on_auth_user_created trigger).
 *
 * Usage (loads secrets from .env.local; never commit that file):
 *   node --env-file=.env.local scripts/provision-org.ts "Milestone" owner@milestone.ge
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const [orgName, ownerEmail] = process.argv.slice(2);

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!orgName || !ownerEmail) {
  console.error('Usage: node --env-file=.env.local scripts/provision-org.ts "<Org Name>" <owner-email>');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserIdByEmail(email: string): Promise<string | null> {
  // Paginate auth users until the email is found.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(error.message);
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 100) break;
  }
  return null;
}

async function main() {
  const ownerId = await findUserIdByEmail(ownerEmail);
  if (!ownerId) {
    throw new Error(`No signed-up user found for ${ownerEmail}. Have them sign up first.`);
  }

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({ name: orgName })
    .select("id")
    .single();
  if (orgErr) throw new Error(orgErr.message);

  const { error: seedErr } = await admin.rpc("seed_org_defaults", {
    p_org: org.id,
    p_owner: ownerId,
  });
  if (seedErr) throw new Error(seedErr.message);

  console.log(`Provisioned org "${orgName}" (${org.id}); owner = ${ownerEmail} (${ownerId}).`);
  console.log("System roles, default permissions, security settings and Owner membership created.");
}

main().catch((e) => {
  console.error("Provisioning failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
