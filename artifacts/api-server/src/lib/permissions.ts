/**
 * The server-side permission catalog is deliberately the only source of valid
 * permission keys. Database values and request payloads are checked against
 * this catalog before they are used for authorization.
 */
export const PERMISSION_CATALOG = [
  // Orders
  { key: "orders.view", section: "orders", label: "View orders" },
  { key: "orders.details", section: "orders", label: "View order details" },
  { key: "orders.support_tools", section: "orders", label: "Manage order support tools" },
  { key: "orders.status", section: "orders", label: "Change order status" },
  { key: "orders.confirm_payment", section: "orders", label: "Confirm payment" },
  { key: "orders.complete", section: "orders", label: "Complete orders" },
  { key: "orders.cancel", section: "orders", label: "Cancel orders" },
  { key: "orders.notes", section: "orders", label: "Manage order notes" },
  { key: "orders.search", section: "orders", label: "Search orders" },
  { key: "orders.export", section: "orders", label: "Export orders" },
  { key: "orders.assign", section: "orders", label: "Assign orders" },
  { key: "orders.archive", section: "orders", label: "Archive orders" },
  // Admin data and configuration
  { key: "customers.view", section: "customers", label: "View customers" },
  { key: "customers.edit", section: "customers", label: "Edit customers" },
  { key: "customers.suspend", section: "customers", label: "Suspend customers" },
  { key: "customers.password_reset", section: "customers", label: "Reset customer passwords" },
  { key: "crypto_assets.view", section: "crypto_assets", label: "View crypto assets" },
  { key: "crypto_assets.manage", section: "crypto_assets", label: "Manage crypto assets" },
  { key: "crypto_networks.view", section: "crypto_networks", label: "View crypto networks" },
  { key: "crypto_networks.manage", section: "crypto_networks", label: "Manage crypto networks" },
  { key: "crypto_networks.receiving_wallets", section: "crypto_networks", label: "Manage receiving wallets", ownerOnly: true },
  { key: "payment_methods.view", section: "payment_methods", label: "View payment methods" },
  { key: "payment_methods.manage", section: "payment_methods", label: "Manage payment methods" },
  { key: "pricing.view", section: "pricing", label: "View pricing and routes" },
  { key: "pricing.manage", section: "pricing", label: "Manage pricing and routes" },
  { key: "receiving_wallets.view", section: "receiving_wallets", label: "View receiving wallets" },
  { key: "receiving_wallets.manage", section: "receiving_wallets", label: "Manage receiving wallets", ownerOnly: true },
  { key: "currencies.view", section: "currencies", label: "View currencies" },
  { key: "currencies.manage", section: "currencies", label: "Manage currencies" },
  { key: "integrations.view", section: "integrations", label: "View integrations" },
  { key: "integrations.credentials.create", section: "integrations", label: "Create integration credentials", ownerOnly: true },
  { key: "integrations.credentials.update", section: "integrations", label: "Update integration credentials", ownerOnly: true },
  { key: "integrations.credentials.delete", section: "integrations", label: "Delete integration credentials", ownerOnly: true },
  { key: "integrations.credentials.rotate", section: "integrations", label: "Rotate integration credentials", ownerOnly: true },
  { key: "integrations.credentials.test", section: "integrations", label: "Test integration credentials", ownerOnly: true },
  { key: "blog.view", section: "blog", label: "View blog content" },
  { key: "blog.manage", section: "blog", label: "Manage blog content" },
  { key: "languages.view", section: "languages", label: "View languages" },
  { key: "languages.manage", section: "languages", label: "Manage languages" },
  { key: "social_media.view", section: "social_media", label: "View social media" },
  { key: "social_media.manage", section: "social_media", label: "Manage social media" },
  { key: "site_settings.view", section: "site_settings", label: "View landing and site settings" },
  { key: "site_settings.manage", section: "site_settings", label: "Manage landing and site settings" },
  { key: "statistics.view", section: "statistics", label: "View statistics" },
  { key: "statistics.export", section: "statistics", label: "Export statistics" },
  // Team and access boundaries
  { key: "team.members.view", section: "team", label: "View team members" },
  { key: "team.members.invite", section: "team", label: "Invite team members", ownerOnly: true },
  { key: "team.members.update", section: "team", label: "Update team members", ownerOnly: true },
  { key: "team.members.suspend", section: "team", label: "Suspend team members", ownerOnly: true },
  { key: "team.members.remove", section: "team", label: "Remove team members", ownerOnly: true },
  { key: "team.roles.view", section: "team", label: "View reusable roles" },
  { key: "team.roles.create", section: "team", label: "Create reusable roles", ownerOnly: true },
  { key: "team.roles.update", section: "team", label: "Update reusable roles", ownerOnly: true },
  { key: "team.roles.delete", section: "team", label: "Delete reusable roles", ownerOnly: true },
  { key: "team.permissions.individual", section: "team", label: "Change individual permissions", ownerOnly: true },
  { key: "team.owner.lifecycle", section: "team", label: "Manage owner lifecycle", ownerOnly: true },
  { key: "team.activity.view", section: "team", label: "View admin activity" },
  // These are used by existing Admin APIs.
  { key: "affiliates.view", section: "affiliates", label: "View affiliates and referrals" },
  { key: "affiliates.manage", section: "affiliates", label: "Manage affiliates and referrals" },
] as const;

export type PermissionKey = (typeof PERMISSION_CATALOG)[number]["key"];
export type PermissionDefinition = (typeof PERMISSION_CATALOG)[number] & {
  ownerOnly?: boolean;
};

export const PERMISSION_KEYS = new Set<string>(
  PERMISSION_CATALOG.map(({ key }) => key),
);

export const OWNER_ONLY_PERMISSION_KEYS = new Set<PermissionKey>(
  PERMISSION_CATALOG.filter(
    (permission) => "ownerOnly" in permission && permission.ownerOnly,
  ).map(
    ({ key }) => key,
  ),
);

export function isPermissionKey(value: string): value is PermissionKey {
  return PERMISSION_KEYS.has(value);
}

export function validatePermissionKeys(values: readonly string[]): PermissionKey[] {
  const unique = [...new Set(values)];
  if (unique.some((value) => !isPermissionKey(value))) {
    throw new Error("Unknown permission key.");
  }
  return unique as PermissionKey[];
}

export function groupPermissionCatalog(): Record<string, PermissionDefinition[]> {
  return PERMISSION_CATALOG.reduce<Record<string, PermissionDefinition[]>>(
    (groups, permission) => {
      (groups[permission.section] ??= []).push(permission);
      return groups;
    },
    {},
  );
}
