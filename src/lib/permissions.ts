/**
 * Staff permissions: per section, the verbs a staff member may use.
 * Administrators working in their own shop have every permission.
 * Used on the server (enforcement) and in the UI (hiding actions).
 */

export const PERMISSION_SECTIONS = [
  'dashboard', 'customer', 'supplier', 'inventory', 'purchase', 'sales', 'returns_refunds', 'expense', 'due_recover',
  'staff', 'attendance', 'salary', 'report', 'settings', 'connectx', 'zudo', 'vaultium',
] as const;
export type PermissionSection = (typeof PERMISSION_SECTIONS)[number];
export type PermissionVerb = 'view' | 'add' | 'edit' | 'delete' | 'send';
export type PermissionMap = Partial<Record<PermissionSection, PermissionVerb[]>>;

const CRUD: readonly PermissionVerb[] = ['view', 'add', 'edit', 'delete'];
const MESSAGING: readonly PermissionVerb[] = ['view', 'send', 'delete'];

export const SECTION_VERBS: Readonly<Record<PermissionSection, readonly PermissionVerb[]>> = {
  dashboard: ['view'], customer: CRUD, supplier: CRUD, inventory: CRUD, purchase: CRUD, sales: CRUD, returns_refunds: CRUD,
  expense: CRUD, due_recover: ['view', 'add'], staff: CRUD, attendance: ['view', 'add', 'edit'], salary: CRUD, report: ['view'],
  settings: ['view', 'edit'], connectx: MESSAGING, zudo: MESSAGING, vaultium: ['view', 'add', 'delete'],
};

export const SECTION_LABELS: Readonly<Record<PermissionSection, string>> = {
  dashboard: 'Dashboard', customer: 'Customers', supplier: 'Suppliers', inventory: 'Inventory', purchase: 'Purchases', sales: 'Sales',
  returns_refunds: 'Returns & exchanges', expense: 'Expenses', due_recover: 'Due collection', staff: 'Staff', attendance: 'Attendance',
  salary: 'Salary', report: 'Reports', settings: 'Shop settings', connectx: 'ConnectX', zudo: 'Zudo AI', vaultium: 'Vaultium',
};

/** Keeps only known sections and the verbs each section supports. */
export function normalizePermissions(input: unknown): PermissionMap {
  const src = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const out: PermissionMap = {};
  for (const section of PERMISSION_SECTIONS) {
    const given = Array.isArray(src[section]) ? (src[section] as unknown[]) : [];
    const verbs = SECTION_VERBS[section].filter((v) => given.includes(v));
    if (verbs.length) out[section] = verbs;
  }
  return out;
}

export function allPermissions(): PermissionMap {
  const out: PermissionMap = {};
  for (const section of PERMISSION_SECTIONS) out[section] = [...SECTION_VERBS[section]];
  return out;
}

/** Everyone in a shop can see the dashboard; anything else needs the verb. */
export function can(permissions: PermissionMap, section: PermissionSection, verb: PermissionVerb): boolean {
  if (section === 'dashboard' && verb === 'view') return true;
  return permissions[section]?.includes(verb) ?? false;
}
