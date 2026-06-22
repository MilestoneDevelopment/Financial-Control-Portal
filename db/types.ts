/**
 * Supabase database types - generated from the live schema (through migration 0007).
 * Regenerate after schema changes:
 *   supabase gen types typescript --linked > db/types.ts
 * (or via the MCP `generate_typescript_types` tool). Do not edit by hand.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounting_file_issues: {
        Row: {
          code: string
          company_id: string
          created_at: string
          details: Json
          file_id: string
          id: string
          message: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          row_index: number | null
          severity: Database["public"]["Enums"]["upload_issue_severity"]
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          details?: Json
          file_id: string
          id?: string
          message: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          row_index?: number | null
          severity?: Database["public"]["Enums"]["upload_issue_severity"]
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          details?: Json
          file_id?: string
          id?: string
          message?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          row_index?: number | null
          severity?: Database["public"]["Enums"]["upload_issue_severity"]
        }
        Relationships: [
          {
            foreignKeyName: "accounting_file_issues_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_file_issues_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "accounting_files"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_files: {
        Row: {
          company_id: string
          created_at: string
          detected_period_end: string | null
          detected_period_start: string | null
          file_size: number | null
          id: string
          import_status: Database["public"]["Enums"]["import_status"]
          is_correction_upload: boolean
          is_superseded: boolean
          original_filename: string
          period_id: string | null
          row_count: number | null
          selected_period_end: string | null
          selected_period_start: string | null
          storage_path: string
          supersedes_file_id: string | null
          updated_at: string
          uploaded_by: string | null
          validation_status: Database["public"]["Enums"]["upload_validation_status"]
        }
        Insert: {
          company_id: string
          created_at?: string
          detected_period_end?: string | null
          detected_period_start?: string | null
          file_size?: number | null
          id?: string
          import_status?: Database["public"]["Enums"]["import_status"]
          is_correction_upload?: boolean
          is_superseded?: boolean
          original_filename: string
          period_id?: string | null
          row_count?: number | null
          selected_period_end?: string | null
          selected_period_start?: string | null
          storage_path: string
          supersedes_file_id?: string | null
          updated_at?: string
          uploaded_by?: string | null
          validation_status?: Database["public"]["Enums"]["upload_validation_status"]
        }
        Update: {
          company_id?: string
          created_at?: string
          detected_period_end?: string | null
          detected_period_start?: string | null
          file_size?: number | null
          id?: string
          import_status?: Database["public"]["Enums"]["import_status"]
          is_correction_upload?: boolean
          is_superseded?: boolean
          original_filename?: string
          period_id?: string | null
          row_count?: number | null
          selected_period_end?: string | null
          selected_period_start?: string | null
          storage_path?: string
          supersedes_file_id?: string | null
          updated_at?: string
          uploaded_by?: string | null
          validation_status?: Database["public"]["Enums"]["upload_validation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "accounting_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_files_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_files_supersedes_file_id_fkey"
            columns: ["supersedes_file_id"]
            isOneToOne: false
            referencedRelation: "accounting_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          company_id: string | null
          created_at: string
          details: Json
          id: number
          org_id: string
          severity: Database["public"]["Enums"]["audit_severity"]
          target: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          company_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          org_id: string
          severity?: Database["public"]["Enums"]["audit_severity"]
          target?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          company_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          org_id?: string
          severity?: Database["public"]["Enums"]["audit_severity"]
          target?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_fkey"
            columns: ["actor"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      capabilities: {
        Row: {
          capability_key: string
          group_label: string
          label: string
          min_level: number
        }
        Insert: {
          capability_key: string
          group_label: string
          label: string
          min_level: number
        }
        Update: {
          capability_key?: string
          group_label?: string
          label?: string
          min_level?: number
        }
        Relationships: []
      }
      cf_nodes: {
        Row: {
          cash_direction: Database["public"]["Enums"]["cash_direction"]
          company_id: string
          created_at: string
          dept: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["cf_node_kind"]
          label: string
          parent_id: string | null
          sort_order: number
          structure_version_id: string
        }
        Insert: {
          cash_direction?: Database["public"]["Enums"]["cash_direction"]
          company_id: string
          created_at?: string
          dept?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["cf_node_kind"]
          label: string
          parent_id?: string | null
          sort_order?: number
          structure_version_id: string
        }
        Update: {
          cash_direction?: Database["public"]["Enums"]["cash_direction"]
          company_id?: string
          created_at?: string
          dept?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["cf_node_kind"]
          label?: string
          parent_id?: string | null
          sort_order?: number
          structure_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cf_nodes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cf_nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "cf_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cf_nodes_structure_version_id_fkey"
            columns: ["structure_version_id"]
            isOneToOne: false
            referencedRelation: "cf_structure_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      cf_structure_versions: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          status: Database["public"]["Enums"]["structure_version_status"]
          version_no: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          status?: Database["public"]["Enums"]["structure_version_status"]
          version_no: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          status?: Database["public"]["Enums"]["structure_version_status"]
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "cf_structure_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cf_structure_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      classification_rules: {
        Row: {
          cash_direction: Database["public"]["Enums"]["cash_direction"] | null
          class_id: string
          company_id: string
          confidence_score: number
          created_at: string
          created_by: string | null
          credit_account_pattern: string | null
          currency: Database["public"]["Enums"]["currency"] | null
          debit_account_pattern: string | null
          description_pattern: string | null
          id: string
          is_active: boolean
          max_amount: number | null
          min_amount: number | null
          name: string
          org_id: string
          priority: number
          rule_type: Database["public"]["Enums"]["classification_rule_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cash_direction?: Database["public"]["Enums"]["cash_direction"] | null
          class_id: string
          company_id: string
          confidence_score?: number
          created_at?: string
          created_by?: string | null
          credit_account_pattern?: string | null
          currency?: Database["public"]["Enums"]["currency"] | null
          debit_account_pattern?: string | null
          description_pattern?: string | null
          id?: string
          is_active?: boolean
          max_amount?: number | null
          min_amount?: number | null
          name: string
          org_id: string
          priority?: number
          rule_type: Database["public"]["Enums"]["classification_rule_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cash_direction?: Database["public"]["Enums"]["cash_direction"] | null
          class_id?: string
          company_id?: string
          confidence_score?: number
          created_at?: string
          created_by?: string | null
          credit_account_pattern?: string | null
          currency?: Database["public"]["Enums"]["currency"] | null
          debit_account_pattern?: string | null
          description_pattern?: string | null
          id?: string
          is_active?: boolean
          max_amount?: number | null
          min_amount?: number | null
          name?: string
          org_id?: string
          priority?: number
          rule_type?: Database["public"]["Enums"]["classification_rule_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classification_rules_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "cf_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classification_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classification_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          base_currency: Database["public"]["Enums"]["currency"]
          created_at: string
          id: string
          in_portfolio: boolean
          name: string
          org_id: string
          short_code: string | null
          status: Database["public"]["Enums"]["company_status"]
          structure_source: string | null
        }
        Insert: {
          base_currency?: Database["public"]["Enums"]["currency"]
          created_at?: string
          id?: string
          in_portfolio?: boolean
          name: string
          org_id: string
          short_code?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          structure_source?: string | null
        }
        Update: {
          base_currency?: Database["public"]["Enums"]["currency"]
          created_at?: string
          id?: string
          in_portfolio?: boolean
          name?: string
          org_id?: string
          short_code?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          structure_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          created_at: string
          id: string
          quote_currency: Database["public"]["Enums"]["currency"]
          rate: number
          rate_date: string
          source: Database["public"]["Enums"]["fx_rate_source"]
        }
        Insert: {
          created_at?: string
          id?: string
          quote_currency: Database["public"]["Enums"]["currency"]
          rate: number
          rate_date: string
          source: Database["public"]["Enums"]["fx_rate_source"]
        }
        Update: {
          created_at?: string
          id?: string
          quote_currency?: Database["public"]["Enums"]["currency"]
          rate?: number
          rate_date?: string
          source?: Database["public"]["Enums"]["fx_rate_source"]
        }
        Relationships: []
      }
      invitations: {
        Row: {
          company_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          role_id: string
          status: Database["public"]["Enums"]["invitation_status"]
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          org_id: string
          role_id: string
          status?: Database["public"]["Enums"]["invitation_status"]
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role_id?: string
          status?: Database["public"]["Enums"]["invitation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          org_id: string
          role_id: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          org_id: string
          role_id: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          org_id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closing_balance: number | null
          company_id: string
          correction_reason: string | null
          created_at: string
          fx_fluctuations_gel: number | null
          id: string
          is_correction_mode: boolean
          locked_at: string | null
          locked_by: string | null
          month: number | null
          opening_balance: number | null
          opening_balance_set_at: string | null
          opening_balance_set_by: string | null
          opening_balance_source:
            | Database["public"]["Enums"]["opening_balance_source"]
            | null
          status: Database["public"]["Enums"]["period_status"]
          structure_version_id: string | null
          year: number
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closing_balance?: number | null
          company_id: string
          correction_reason?: string | null
          created_at?: string
          fx_fluctuations_gel?: number | null
          id?: string
          is_correction_mode?: boolean
          locked_at?: string | null
          locked_by?: string | null
          month?: number | null
          opening_balance?: number | null
          opening_balance_set_at?: string | null
          opening_balance_set_by?: string | null
          opening_balance_source?:
            | Database["public"]["Enums"]["opening_balance_source"]
            | null
          status?: Database["public"]["Enums"]["period_status"]
          structure_version_id?: string | null
          year: number
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closing_balance?: number | null
          company_id?: string
          correction_reason?: string | null
          created_at?: string
          fx_fluctuations_gel?: number | null
          id?: string
          is_correction_mode?: boolean
          locked_at?: string | null
          locked_by?: string | null
          month?: number | null
          opening_balance?: number | null
          opening_balance_set_at?: string | null
          opening_balance_set_by?: string | null
          opening_balance_source?:
            | Database["public"]["Enums"]["opening_balance_source"]
            | null
          status?: Database["public"]["Enums"]["period_status"]
          structure_version_id?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "periods_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "periods_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "periods_opening_balance_set_by_fkey"
            columns: ["opening_balance_set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "periods_structure_version_id_fkey"
            columns: ["structure_version_id"]
            isOneToOne: false
            referencedRelation: "cf_structure_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          appearance: Json
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          notif_prefs: Json
        }
        Insert: {
          appearance?: Json
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          notif_prefs?: Json
        }
        Update: {
          appearance?: Json
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          notif_prefs?: Json
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          allowed: boolean
          capability_key: string
          role_id: string
        }
        Insert: {
          allowed: boolean
          capability_key: string
          role_id: string
        }
        Update: {
          allowed?: boolean
          capability_key?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_capability_key_fkey"
            columns: ["capability_key"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["capability_key"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          key: string
          level: number
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key: string
          level?: number
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key?: string
          level?: number
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      security_settings: {
        Row: {
          default_role_key: string
          invite_expiry_days: number
          org_id: string
          settings: Json
          updated_at: string
        }
        Insert: {
          default_role_key?: string
          invite_expiry_days?: number
          org_id: string
          settings?: Json
          updated_at?: string
        }
        Update: {
          default_role_key?: string
          invite_expiry_days?: number
          org_id?: string
          settings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount_gel: number | null
          class_id: string | null
          classification_confidence: number | null
          classification_source:
            | Database["public"]["Enums"]["classification_source"]
            | null
          classification_status: Database["public"]["Enums"]["tx_classification_status"]
          classified_at: string | null
          classified_by: string | null
          comment: string | null
          company_id: string
          created_at: string
          credit_account: string | null
          credit_amount: number | null
          debit_account: string | null
          debit_amount: number | null
          description: string | null
          document_ref: string | null
          file_id: string
          fx_rate_date: string | null
          fx_rate_source: Database["public"]["Enums"]["fx_rate_source"] | null
          fx_rate_to_gel: number | null
          fx_status: Database["public"]["Enums"]["fx_status"]
          id: string
          matched_rule_id: string | null
          original_amount: number | null
          original_currency: Database["public"]["Enums"]["currency"] | null
          period_id: string | null
          raw_row_json: Json
          reference: string | null
          row_index: number | null
          transaction_date: string | null
        }
        Insert: {
          amount_gel?: number | null
          class_id?: string | null
          classification_confidence?: number | null
          classification_source?:
            | Database["public"]["Enums"]["classification_source"]
            | null
          classification_status?: Database["public"]["Enums"]["tx_classification_status"]
          classified_at?: string | null
          classified_by?: string | null
          comment?: string | null
          company_id: string
          created_at?: string
          credit_account?: string | null
          credit_amount?: number | null
          debit_account?: string | null
          debit_amount?: number | null
          description?: string | null
          document_ref?: string | null
          file_id: string
          fx_rate_date?: string | null
          fx_rate_source?: Database["public"]["Enums"]["fx_rate_source"] | null
          fx_rate_to_gel?: number | null
          fx_status?: Database["public"]["Enums"]["fx_status"]
          id?: string
          matched_rule_id?: string | null
          original_amount?: number | null
          original_currency?: Database["public"]["Enums"]["currency"] | null
          period_id?: string | null
          raw_row_json?: Json
          reference?: string | null
          row_index?: number | null
          transaction_date?: string | null
        }
        Update: {
          amount_gel?: number | null
          class_id?: string | null
          classification_confidence?: number | null
          classification_source?:
            | Database["public"]["Enums"]["classification_source"]
            | null
          classification_status?: Database["public"]["Enums"]["tx_classification_status"]
          classified_at?: string | null
          classified_by?: string | null
          comment?: string | null
          company_id?: string
          created_at?: string
          credit_account?: string | null
          credit_amount?: number | null
          debit_account?: string | null
          debit_amount?: number | null
          description?: string | null
          document_ref?: string | null
          file_id?: string
          fx_rate_date?: string | null
          fx_rate_source?: Database["public"]["Enums"]["fx_rate_source"] | null
          fx_rate_to_gel?: number | null
          fx_status?: Database["public"]["Enums"]["fx_status"]
          id?: string
          matched_rule_id?: string | null
          original_amount?: number | null
          original_currency?: Database["public"]["Enums"]["currency"] | null
          period_id?: string | null
          raw_row_json?: Json
          reference?: string | null
          row_index?: number | null
          transaction_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "cf_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "accounting_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_can: { Args: { cap: string; p_company: string }; Returns: boolean }
      auth_can_org: { Args: { cap: string; p_org: string }; Returns: boolean }
      auth_company_ids: { Args: never; Returns: string[] }
      auth_org_ids: { Args: never; Returns: string[] }
      auth_role_for_company: {
        Args: { p_company: string }
        Returns: {
          level: number
          role_id: string
        }[]
      }
      auth_role_for_org: {
        Args: { p_org: string }
        Returns: {
          level: number
          role_id: string
        }[]
      }
      cache_fx_rate: {
        Args: {
          p_currency: Database["public"]["Enums"]["currency"]
          p_date: string
          p_rate: number
          p_source: Database["public"]["Enums"]["fx_rate_source"]
        }
        Returns: undefined
      }
      provision_org: {
        Args: { p_name: string; p_owner: string }
        Returns: string
      }
      seed_org_defaults: {
        Args: { p_org: string; p_owner: string }
        Returns: undefined
      }
      set_period_opening_balance: {
        Args: {
          p_period_id: string
          p_amount: number
          p_source: Database["public"]["Enums"]["opening_balance_source"]
        }
        Returns: undefined
      }
    }
    Enums: {
      audit_severity: "ok" | "warn"
      cash_direction: "in" | "out" | "neutral" | "both"
      cf_node_kind: "section" | "group" | "class"
      classification_rule_type:
        | "account_exact"
        | "account_pair"
        | "description_contains"
        | "description_regex"
        | "amount_direction"
        | "combined"
      classification_source: "manual" | "rule" | "import"
      company_status: "draft" | "active" | "archived"
      currency: "GEL" | "USD" | "EUR"
      fx_rate_source: "imported" | "nbg" | "nbg_prior_filled" | "manual"
      fx_status: "not_required" | "pending" | "resolved" | "manual"
      import_status: "uploaded" | "parsing" | "parsed" | "imported" | "failed"
      invitation_status: "pending" | "accepted" | "expired" | "cancelled"
      opening_balance_source: "carried" | "imported" | "manual"
      period_status: "draft" | "active" | "locked" | "closed" | "archived"
      structure_version_status: "draft" | "active" | "superseded"
      tx_classification_status:
        | "unclassified"
        | "suggested"
        | "confirmed"
        | "rejected"
      upload_issue_severity: "error" | "warning" | "info"
      upload_validation_status: "pending" | "passed" | "warnings" | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      audit_severity: ["ok", "warn"],
      cash_direction: ["in", "out", "neutral", "both"],
      cf_node_kind: ["section", "group", "class"],
      classification_rule_type: [
        "account_exact",
        "account_pair",
        "description_contains",
        "description_regex",
        "amount_direction",
        "combined",
      ],
      classification_source: ["manual", "rule", "import"],
      company_status: ["draft", "active", "archived"],
      currency: ["GEL", "USD", "EUR"],
      fx_rate_source: ["imported", "nbg", "nbg_prior_filled", "manual"],
      fx_status: ["not_required", "pending", "resolved", "manual"],
      import_status: ["uploaded", "parsing", "parsed", "imported", "failed"],
      invitation_status: ["pending", "accepted", "expired", "cancelled"],
      opening_balance_source: ["carried", "imported", "manual"],
      period_status: ["draft", "active", "locked", "closed", "archived"],
      structure_version_status: ["draft", "active", "superseded"],
      tx_classification_status: [
        "unclassified",
        "suggested",
        "confirmed",
        "rejected",
      ],
      upload_issue_severity: ["error", "warning", "info"],
      upload_validation_status: ["pending", "passed", "warnings", "failed"],
    },
  },
} as const
