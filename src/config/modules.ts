import type { PermissionSection } from '@/lib/permissions';

/**
 * Module registry: every EMS module, what it can do, which add-on licence it
 * needs and where it appears in each console. Console navigation is generated
 * from here, so a module is added in one place. Shared by server and browser.
 */

export type ConsoleScope = 'owner' | 'admin' | 'shop';

/** Add-ons that need a licence allowance or an add-on purchase. */
export const ADDON_KEYS = ['connectx', 'zudo', 'business_health', 'truebill', 'vaultium'] as const;
export type AddonKey = (typeof ADDON_KEYS)[number];
export const ADDON_INFO: Record<AddonKey, { name: string; unit: string }> = {
  connectx: { name: 'ConnectX', unit: 'messages per day' },
  zudo: { name: 'Zudo AI', unit: 'questions per day' },
  business_health: { name: 'AI Business Health', unit: 'reports per day' },
  truebill: { name: 'TrueBill', unit: 'enabled' },
  vaultium: { name: 'Vaultium', unit: 'GB of storage' },
};

export type IconName =
  | 'overview' | 'users' | 'store' | 'shield' | 'list' | 'puzzle' | 'palette' | 'file' | 'rss' | 'inbox' | 'help' | 'mail' | 'link'
  | 'sparkles' | 'stethoscope' | 'qr' | 'folder' | 'download' | 'settings' | 'key' | 'devices' | 'user' | 'receipt' | 'cart'
  | 'package' | 'truck' | 'rotate' | 'wallet' | 'coins' | 'chart' | 'activity';

export interface NavItem {
  /** Path below the console root ('' = the console home). */
  slug: string;
  label: string;
  icon: IconName;
  group: string;
  /** Shop console: the permission section needed to see the page. */
  section?: PermissionSection;
}

export interface ModuleManifest {
  id: string;
  name: string;
  kind: 'core' | 'addon' | 'integration';
  summary: string;
  requires?: AddonKey;
  capabilities: readonly string[];
  nav: Partial<Record<ConsoleScope, readonly NavItem[]>>;
}

export const MODULES = [
  {
    id: 'platform', name: 'Platform', kind: 'core', summary: 'Owner overview, administrators, shops and system tools.',
    capabilities: ['platform:overview', 'platform:administrators', 'platform:system'],
    nav: {
      owner: [
        { slug: '', label: 'Overview', icon: 'overview', group: 'Platform' },
        { slug: 'administrators', label: 'Administrators', icon: 'users', group: 'Business' },
        { slug: 'shops', label: 'Shops', icon: 'store', group: 'Business' },
        { slug: 'system', label: 'System', icon: 'settings', group: 'Platform' },
      ],
      admin: [
        { slug: '', label: 'Overview', icon: 'overview', group: 'Business' },
        { slug: 'shops', label: 'Shops', icon: 'store', group: 'Business' },
        { slug: 'devices', label: 'Devices', icon: 'devices', group: 'Account' },
        { slug: 'profile', label: 'Profile', icon: 'user', group: 'Account' },
      ],
    },
  },
  {
    id: 'licensing', name: 'Licences', kind: 'core', summary: 'Licence plans, purchases, reviews and entitlements.',
    capabilities: ['license:plans', 'license:purchase', 'license:review'],
    nav: {
      owner: [
        { slug: 'licenses', label: 'Licence requests', icon: 'shield', group: 'Business' },
        { slug: 'plans', label: 'Licence plans', icon: 'list', group: 'Business' },
      ],
      admin: [{ slug: 'licenses', label: 'Licence', icon: 'key', group: 'Business' }],
    },
  },
  {
    id: 'addons', name: 'Add-ons', kind: 'core', summary: 'Sell add-on time and allowances separately from licences.',
    capabilities: ['addon:catalogue', 'addon:purchase', 'addon:review'],
    nav: {
      owner: [{ slug: 'addons', label: 'Add-ons', icon: 'puzzle', group: 'Business' }],
      admin: [{ slug: 'addons', label: 'Add-ons', icon: 'puzzle', group: 'Business' }],
    },
  },
  {
    id: 'website', name: 'Website', kind: 'core', summary: 'Branding, website pages, blog and the contact inbox.',
    capabilities: ['cms:branding', 'cms:pages', 'cms:blog', 'contact:inbox'],
    nav: {
      owner: [
        { slug: 'branding', label: 'Branding', icon: 'palette', group: 'Website' },
        { slug: 'pages', label: 'Pages', icon: 'file', group: 'Website' },
        { slug: 'blog', label: 'Blog', icon: 'rss', group: 'Website' },
        { slug: 'messages', label: 'Contact messages', icon: 'inbox', group: 'Website' },
      ],
    },
  },
  {
    id: 'helpdesk', name: 'Help desk', kind: 'core', summary: 'Conversations between administrators and the platform owner.',
    capabilities: ['helpdesk:chat'],
    nav: {
      owner: [{ slug: 'helpdesk', label: 'Help desk', icon: 'help', group: 'Business' }],
      admin: [{ slug: 'helpdesk', label: 'Help desk', icon: 'help', group: 'Account' }],
    },
  },
  {
    id: 'shop-core', name: 'Shop operations', kind: 'core', summary: 'Customers, suppliers, inventory, expenses, settings and activity.',
    capabilities: ['shop:records', 'shop:settings', 'shop:activity'],
    nav: {
      shop: [
        { slug: '', label: 'Dashboard', icon: 'overview', group: 'Overview', section: 'dashboard' },
        { slug: 'inventory', label: 'Inventory', icon: 'package', group: 'Operations', section: 'inventory' },
        { slug: 'customers', label: 'Customers', icon: 'users', group: 'Operations', section: 'customer' },
        { slug: 'suppliers', label: 'Suppliers', icon: 'truck', group: 'Operations', section: 'supplier' },
        { slug: 'expenses', label: 'Expenses', icon: 'wallet', group: 'Operations', section: 'expense' },
        { slug: 'settings', label: 'Settings', icon: 'settings', group: 'Shop', section: 'settings' },
        { slug: 'activity', label: 'Activity', icon: 'activity', group: 'Shop', section: 'settings' },
      ],
    },
  },
  {
    id: 'invoicing', name: 'Invoicing', kind: 'core', summary: 'Sale and purchase invoices with VAT, discounts and printing.',
    capabilities: ['invoice:sale', 'invoice:purchase', 'invoice:print'],
    nav: {
      shop: [
        { slug: 'sales', label: 'Sales', icon: 'receipt', group: 'Operations', section: 'sales' },
        { slug: 'purchases', label: 'Purchases', icon: 'cart', group: 'Operations', section: 'purchase' },
      ],
    },
  },
  {
    id: 'after-sales', name: 'Returns & exchanges', kind: 'core', summary: 'Sales returns with refunds and exchanges; damaged goods kept apart.',
    capabilities: ['return:create', 'exchange:create'],
    nav: { shop: [{ slug: 'returns', label: 'Returns & exchanges', icon: 'rotate', group: 'Operations', section: 'returns_refunds' }] },
  },
  {
    id: 'dues', name: 'Dues', kind: 'core', summary: 'Collect what customers owe and pay what you owe.',
    capabilities: ['due:collect'],
    nav: { shop: [{ slug: 'dues', label: 'Dues', icon: 'coins', group: 'Operations', section: 'due_recover' }] },
  },
  {
    id: 'staff', name: 'Staff', kind: 'core', summary: 'Staff accounts and permissions, attendance and salary.',
    capabilities: ['staff:accounts', 'staff:attendance', 'staff:salary'],
    nav: { shop: [{ slug: 'staff', label: 'Staff', icon: 'user', group: 'People', section: 'staff' }] },
  },
  {
    id: 'reports', name: 'Reports', kind: 'core', summary: 'Sales, purchases, expenses and dues by period.',
    capabilities: ['report:period'],
    nav: { shop: [{ slug: 'reports', label: 'Reports', icon: 'chart', group: 'Insights', section: 'report' }] },
  },
  {
    id: 'connectx', name: 'ConnectX', kind: 'addon', requires: 'connectx', summary: 'Email (Brevo) and SMS through Connect App.',
    capabilities: ['email:send', 'sms:send', 'sms:auto'],
    nav: {
      owner: [{ slug: 'connectx', label: 'ConnectX', icon: 'mail', group: 'Services' }],
      shop: [{ slug: 'connectx', label: 'ConnectX', icon: 'mail', group: 'Add-ons', section: 'connectx' }],
    },
  },
  {
    id: 'connect-app', name: 'Connect App', kind: 'integration', summary: 'Signed pairing with the Connect App (SMS gateway).',
    capabilities: ['connect:pair', 'connect:relay-sms'],
    nav: { owner: [{ slug: 'connect-app', label: 'Connect App', icon: 'link', group: 'Services' }] },
  },
  {
    id: 'zudo', name: 'Zudo AI', kind: 'addon', requires: 'zudo', summary: 'Read-only AI assistant answering from shop data.',
    capabilities: ['ai:chat'],
    nav: {
      owner: [{ slug: 'ai', label: 'AI settings', icon: 'sparkles', group: 'Services' }],
      shop: [{ slug: 'zudo', label: 'Zudo AI', icon: 'sparkles', group: 'Add-ons', section: 'zudo' }],
    },
  },
  {
    id: 'business-health', name: 'AI Business Health', kind: 'addon', requires: 'business_health', summary: 'Period health score with AI-written advice.',
    capabilities: ['ai:health-report'],
    nav: { shop: [{ slug: 'health', label: 'Business Health', icon: 'stethoscope', group: 'Insights', section: 'report' }] },
  },
  {
    id: 'truebill', name: 'TrueBill', kind: 'addon', requires: 'truebill', summary: 'QR verification for invoices, returns and exchanges.',
    capabilities: ['document:verify'],
    nav: { owner: [{ slug: 'truebill', label: 'TrueBill scans', icon: 'qr', group: 'Services' }] },
  },
  {
    id: 'vaultium', name: 'Vaultium', kind: 'addon', requires: 'vaultium', summary: 'File storage for invoice and expense documents.',
    capabilities: ['files:store'],
    nav: { shop: [{ slug: 'files', label: 'Vaultium', icon: 'folder', group: 'Add-ons', section: 'vaultium' }] },
  },
  {
    id: 'app-store', name: 'App Store', kind: 'integration', summary: 'Publish and distribute the EMS Android apps.',
    capabilities: ['apps:publish', 'apps:download'],
    nav: { owner: [{ slug: 'apps', label: 'App Store', icon: 'download', group: 'Services' }] },
  },
] as const satisfies readonly ModuleManifest[];

const NAV_GROUPS: Record<ConsoleScope, readonly string[]> = {
  owner: ['Platform', 'Business', 'Website', 'Services'],
  admin: ['Business', 'Account'],
  shop: ['Overview', 'Operations', 'People', 'Insights', 'Add-ons', 'Shop'],
};

const NAV_ORDER: Record<ConsoleScope, readonly string[]> = {
  owner: ['', 'system', 'administrators', 'shops', 'licenses', 'plans', 'addons', 'helpdesk', 'branding', 'pages', 'blog', 'messages', 'connectx', 'connect-app', 'ai', 'truebill', 'apps'],
  admin: ['', 'shops', 'licenses', 'addons', 'helpdesk', 'devices', 'profile'],
  shop: ['', 'sales', 'purchases', 'inventory', 'customers', 'suppliers', 'returns', 'dues', 'expenses', 'staff', 'reports', 'health', 'connectx', 'zudo', 'files', 'settings', 'activity'],
};

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/** Console navigation, grouped; `visible` filters items (e.g. by staff permission). */
export function navFor(scope: ConsoleScope, visible: (item: NavItem) => boolean = () => true): NavGroup[] {
  const items: NavItem[] = MODULES.flatMap((m) => (m.nav as ModuleManifest['nav'])[scope] ?? []).filter(visible);
  const order = NAV_ORDER[scope];
  items.sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug));
  return NAV_GROUPS[scope].map((title) => ({ title, items: items.filter((i) => i.group === title) })).filter((g) => g.items.length > 0);
}
