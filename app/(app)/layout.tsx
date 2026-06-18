import { redirect } from "next/navigation";
import { ShellFrame } from "@/components/shell/ShellFrame";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Protected app area is always request-rendered (reads auth cookies).
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let email = "demo@local";

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    email = user.email ?? "unknown";
  }

  // Active company is resolved from real membership/URL in Phase 1; the
  // foundation uses a stable placeholder so the shell is navigable.
  const companyId = "demo";

  return (
    <ShellFrame email={email} companyId={companyId}>
      {children}
    </ShellFrame>
  );
}
