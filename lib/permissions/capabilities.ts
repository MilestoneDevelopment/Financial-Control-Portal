/**
 * Capability-based permission model.
 *
 * Capability keys are taken verbatim from the prototype's grouped permission
 * matrix. Enforcement is layered: RLS (DB) + server-action guards + UI gating.
 * Roles carry a numeric level; a capability has a minimum level. A role is
 * granted a capability when role.level >= capability.minLevel, unless an
 * explicit override exists in role_permissions (for custom/fine-tuned roles).
 *
 * This mirrors the prototype's `lvl[r] >= p[1]` logic.
 */

export const ROLE_LEVEL = {
  owner: 5,
  admin: 4,
  cfo: 3,
  editor: 2,
  viewer: 1,
} as const;

export type SystemRoleKey = keyof typeof ROLE_LEVEL;

export interface Capability {
  key: string;
  group: string;
  label: string;
  /** Minimum role level that holds this capability by default. */
  minLevel: number;
}

export const CAPABILITIES: Capability[] = [
  // Dashboard & Reports
  { key: "dashboard.view", group: "Dashboard & Reports", label: "View dashboard", minLevel: 1 },
  { key: "portfolio.view", group: "Dashboard & Reports", label: "View portfolio overview", minLevel: 1 },

  // Upload & Classification
  { key: "upload.file", group: "Upload & Classification", label: "Upload accounting file", minLevel: 2 },
  { key: "upload.remove", group: "Upload & Classification", label: "Remove uploaded file", minLevel: 3 },
  { key: "upload.replace", group: "Upload & Classification", label: "Replace uploaded file", minLevel: 2 },
  { key: "classification.review", group: "Upload & Classification", label: "Review classification", minLevel: 2 },
  { key: "class.add", group: "Upload & Classification", label: "Add class", minLevel: 2 },

  // Forecast & Budget
  { key: "forecast.upload", group: "Forecast & Budget", label: "Upload forecast", minLevel: 2 },
  { key: "forecast.edit", group: "Forecast & Budget", label: "Edit forecast", minLevel: 2 },

  // Cash Flow Structure
  { key: "structure.edit", group: "Cash Flow Structure", label: "Edit cash flow structure", minLevel: 3 },

  // Period Approval & Correction
  { key: "period.approve_lock", group: "Period Approval & Correction", label: "Approve / lock / close period", minLevel: 3 },
  { key: "period.correction_mode", group: "Period Approval & Correction", label: "Enable correction mode", minLevel: 3 },
  { key: "period.set_opening_balance", group: "Period Approval & Correction", label: "Set opening balance manually", minLevel: 3 },

  // Export
  { key: "export.excel", group: "Export", label: "Export Excel", minLevel: 1 },
  { key: "export.pdf", group: "Export", label: "Export PDF", minLevel: 1 },
  { key: "export.raw", group: "Export", label: "Export raw transactions", minLevel: 3 },

  // Admin Settings
  { key: "users.manage", group: "Admin Settings", label: "Manage users", minLevel: 4 },
  { key: "roles.manage", group: "Admin Settings", label: "Manage roles", minLevel: 4 },
  { key: "audit.view", group: "Admin Settings", label: "View audit log", minLevel: 4 },

  // Company Management
  { key: "companies.manage", group: "Company Management", label: "Manage companies", minLevel: 4 },
  { key: "companies.add", group: "Company Management", label: "Add new company", minLevel: 4 },
  { key: "companies.edit", group: "Company Management", label: "Edit company settings", minLevel: 4 },
  { key: "companies.archive", group: "Company Management", label: "Archive company", minLevel: 5 },
  { key: "access.assign", group: "Company Management", label: "Assign company access", minLevel: 4 },
];

export type CapabilityKey = (typeof CAPABILITIES)[number]["key"];

const CAP_BY_KEY = new Map(CAPABILITIES.map((c) => [c.key, c]));

/**
 * Resolve whether a role (by level) holds a capability, honoring an optional
 * explicit override (e.g. for custom roles). Owner (level 5) always holds all.
 */
export function roleHasCapability(
  roleLevel: number,
  capabilityKey: string,
  override?: boolean,
): boolean {
  if (override !== undefined) return override;
  if (roleLevel >= ROLE_LEVEL.owner) return true;
  const cap = CAP_BY_KEY.get(capabilityKey);
  if (!cap) return false;
  return roleLevel >= cap.minLevel;
}
