/**
 * System role definitions. These map to the prototype's role set and the
 * handoff permission table. Custom roles are created per-org with level 0 and
 * rely entirely on explicit role_permissions overrides.
 */
import { ROLE_LEVEL, type SystemRoleKey } from "./capabilities.ts";

export interface SystemRole {
  key: SystemRoleKey;
  name: string;
  level: number;
  description: string;
}

export const SYSTEM_ROLES: SystemRole[] = [
  {
    key: "owner",
    name: "Owner",
    level: ROLE_LEVEL.owner,
    description: "Full control of all companies, users, billing and settings.",
  },
  {
    key: "admin",
    name: "Admin",
    level: ROLE_LEVEL.admin,
    description: "Manage users, roles, companies and access. No billing.",
  },
  {
    key: "cfo",
    name: "Finance Manager / CFO",
    level: ROLE_LEVEL.cfo,
    description: "Full operational access: upload, classify, forecast, approve, lock/close, export.",
  },
  {
    key: "editor",
    name: "Accountant / Editor",
    level: ROLE_LEVEL.editor,
    description: "Upload, classify and edit forecast. No approvals or admin.",
  },
  {
    key: "viewer",
    name: "Viewer",
    level: ROLE_LEVEL.viewer,
    description: "Read-only access to dashboards, cash flow and reports.",
  },
];

export const DEFAULT_INVITE_ROLE: SystemRoleKey = "viewer";
