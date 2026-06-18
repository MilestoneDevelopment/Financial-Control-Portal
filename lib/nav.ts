/**
 * Sidebar navigation config. Mirrors the prototype's grouped nav.
 * In All Companies (portfolio) mode, operational company modules are disabled
 * (dimmed, non-navigable) - only holding-level pages remain reachable.
 */
export type NavScope = "portfolio" | "company" | "admin";

export interface NavItem {
  key: string;
  label: string;
  scope: NavScope;
  /** Path builder. `company` items receive the active company id. */
  href: (companyId: string) => string;
  badgeCapable?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { key: "portfolio", label: "Portfolio Overview", scope: "portfolio", href: () => "/portfolio" },
      { key: "dashboard", label: "Dashboard", scope: "company", href: (c) => `/c/${c}/dashboard` },
      { key: "cashflow", label: "Cash Flow", scope: "company", href: (c) => `/c/${c}/cash-flow` },
      { key: "classification", label: "Classification", scope: "company", href: (c) => `/c/${c}/classification`, badgeCapable: true },
      { key: "variance", label: "Variance Analytics", scope: "company", href: (c) => `/c/${c}/variance` },
    ],
  },
  {
    label: "Data",
    items: [
      { key: "upload", label: "Upload Files", scope: "company", href: (c) => `/c/${c}/upload` },
      { key: "forecast", label: "Forecast & Budget", scope: "company", href: (c) => `/c/${c}/forecast` },
    ],
  },
  {
    label: "Admin",
    items: [
      { key: "structure", label: "Structure Builder", scope: "company", href: (c) => `/c/${c}/structure` },
      { key: "users", label: "Users & Roles", scope: "admin", href: () => "/admin" },
      { key: "reports", label: "Reports & Export", scope: "company", href: (c) => `/c/${c}/reports` },
    ],
  },
];

/** Pages reachable in portfolio (All Companies) mode. */
export const PORTFOLIO_ALLOWED = new Set(["portfolio", "dashboard", "reports", "users"]);
