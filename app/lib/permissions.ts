export const permissionGroups = [
  { key: 'orders', name: '订单', actions: ['view', 'manage'] },
  { key: 'roasting', name: '烘焙及曲线', actions: ['view', 'manage'] },
  { key: 'shipping', name: '发货及签收', actions: ['view', 'manage'] },
  {
    key: 'beans',
    name: '豆子及烘焙方案',
    actions: ['view', 'manage', 'delete'],
  },
  { key: 'inventory', name: '库存及入库', actions: ['view', 'manage'] },
  { key: 'customers', name: '客户档案', actions: ['view', 'manage', 'delete'] },
] as const;
export type Permission =
  `${(typeof permissionGroups)[number]['key']}.${'view' | 'manage' | 'delete'}`;
export const allPermissions = permissionGroups.flatMap((g) =>
  g.actions.map((a) => `${g.key}.${a}` as Permission),
);
export type Account = {
  id: string;
  username: string;
  name: string;
  phone: string;
  email: string;
  role: 'admin' | 'employee';
  permissions: Permission[];
  enabled: boolean;
  must_change_password: boolean;
  revision: number;
  created_at: string;
};
export function can(user: Account | null, permission: Permission) {
  return (
    !!user?.enabled &&
    (user.role === 'admin' || user.permissions.includes(permission))
  );
}
export function normalizePermissions(input: unknown): Permission[] {
  if (!Array.isArray(input) || input.some((p) => !allPermissions.includes(p)))
    throw new Error('权限选项无效。');
  const result = new Set<Permission>(input);
  for (const p of result) result.add(`${p.split('.')[0]}.view` as Permission);
  return [...result];
}
export const routePermission: Record<string, Permission> = {
  '/orders': 'orders.view',
  '/completed': 'orders.view',
  '/roasting': 'roasting.view',
  '/fulfillment': 'shipping.view',
  '/beans': 'beans.view',
  '/customers': 'customers.view',
  '/admin': 'inventory.view',
};
export function mutationPermission(
  kind: string,
  method = 'POST',
): Permission | null {
  if (method === 'DELETE')
    return kind === 'bean'
      ? 'beans.delete'
      : kind === 'customer'
        ? 'customers.delete'
        : null;
  const map: Record<string, Permission> = {
    order: 'orders.manage',
    customer: 'customers.manage',
    bean: 'beans.manage',
    profile: 'beans.manage',
    sku: 'inventory.manage',
    inventory: 'inventory.manage',
    shipment: 'shipping.manage',
    'shipment-status': 'shipping.manage',
    'roast-start': 'roasting.manage',
    status: 'roasting.manage',
    'batch-status': 'roasting.manage',
    'roast-record': 'roasting.manage',
    'roast-finish': 'roasting.manage',
  };
  return map[kind] || null;
}
