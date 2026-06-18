/**
 * Supabase database types.
 *
 * Phase 0 ships a minimal placeholder so the typed Supabase clients compile.
 * Once the migration is applied to a project, regenerate the real types with:
 *
 *   supabase gen types typescript --linked > db/types.ts
 *
 * (or via the MCP `generate_typescript_types` tool) and this placeholder is
 * replaced wholesale.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
