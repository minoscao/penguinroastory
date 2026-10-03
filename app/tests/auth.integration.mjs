import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3002';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname))
  throw new Error('Local test database only');
const setupToken = process.env.TEST_SETUP_TOKEN;
if (!setupToken)
  throw new Error('Set TEST_SETUP_TOKEN for an isolated, empty local database');
const password = 'Local-test-password-' + crypto.randomUUID();
const adminName = 'admin-' + crypto.randomUUID().slice(0, 8);
const employeeName = 'staff-' + crypto.randomUUID().slice(0, 8);
const newPassword = 'Changed-local-' + crypto.randomUUID();
const fixture = {
  origin,
  adminName,
  password,
  accounts: [],
  employeeName,
  newPassword,
};
await mkdir('work', { recursive: true });
const persist = () =>
  writeFile('work/auth-test-records.json', JSON.stringify(fixture));
async function call(
  path,
  body,
  cookie = '',
  status = 200,
  method = 'POST',
  extra = {},
) {
  console.log(method, path, body?.action || body?.kind || '', status);
  const r = await fetch(origin + path, {
    method: body === undefined ? 'GET' : method,
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await r.json();
  assert.equal(r.status, status, JSON.stringify(data));
  return {
    data,
    cookie: r.headers.get('set-cookie')?.split(';')[0] || '',
    headers: r.headers,
  };
}
try {
  for (const kind of ['catalog', 'operations', 'orders', 'detail'])
    await call('/api/roastery?kind=' + kind, undefined, '', 401);
  await call('/api/accounts', undefined, '', 401);
  assert.equal((await call('/api/auth')).data.setupRequired, true);
  await call(
    '/api/auth',
    {
      action: 'setup',
      username: adminName,
      password,
      name: '本地权限验证',
      setupToken: 'wrong',
    },
    '',
    403,
  );
  const bootstrap = await call('/api/auth', {
    action: 'setup',
    username: adminName,
    password,
    name: '本地权限验证',
    setupToken,
  });
  const admin = bootstrap.cookie;
  fixture.accounts.push(bootstrap.data.user.id);
  await persist();
  assert.match(bootstrap.headers.get('set-cookie'), /HttpOnly/);
  assert.match(bootstrap.headers.get('set-cookie'), /SameSite=Strict/);
  await call(
    '/api/auth',
    {
      action: 'setup',
      username: adminName,
      password,
      name: '重复初始化',
      setupToken,
    },
    '',
    409,
  );
  await call(
    '/api/auth',
    {
      action: 'login',
      username: adminName,
      password: 'not-the-correct-password',
    },
    '',
    401,
  );
  await call(
    '/api/accounts',
    {
      username: employeeName,
      name: '本地普通员工',
      phone: '',
      email: '',
      role: 'employee',
      enabled: true,
      permissions: ['beans.view'],
      password,
    },
    admin,
    201,
  );
  const accounts = (await call('/api/accounts', undefined, admin)).data
    .accounts;
  let employee = accounts.find((a) => a.username === employeeName);
  fixture.accounts.push(employee.id);
  await persist();
  assert.ok(accounts.every((a) => !('password_hash' in a)));
  const temp = (
    await call('/api/auth', {
      action: 'login',
      username: employeeName,
      password,
    })
  ).cookie;
  await call('/api/roastery?kind=catalog', undefined, temp, 403);
  await call('/api/accounts', undefined, temp, 403);
  await call(
    '/api/auth',
    { action: 'password', oldPassword: password, password: newPassword },
    temp,
  );
  await call('/api/roastery?kind=catalog', undefined, temp, 401);
  let staff = (
    await call('/api/auth', {
      action: 'login',
      username: employeeName,
      password: newPassword,
    })
  ).cookie;
  await call('/api/accounts', undefined, staff, 403);
  await call(
    '/api/accounts',
    { ...employee, role: 'admin' },
    staff,
    403,
    'PATCH',
  );
  const catalog = (await call('/api/roastery?kind=catalog', undefined, staff))
    .data;
  assert.deepEqual(catalog.customers, []);
  assert.deepEqual(catalog.stats, { waiting: 0, roasting: 0, completed: 0 });
  for (const kind of ['orders', 'detail', 'operations'])
    await call('/api/roastery?kind=' + kind, undefined, staff, 403);
  for (const [method, kinds] of [
    [
      'POST',
      ['customer', 'bean', 'sku', 'profile', 'inventory', 'shipment', 'order'],
    ],
    [
      'PATCH',
      [
        'customer',
        'bean',
        'profile',
        'roast-start',
        'roast-record',
        'roast-finish',
        'shipment-status',
      ],
    ],
    ['DELETE', ['customer', 'bean']],
  ])
    for (const kind of kinds)
      await call(
        '/api/roastery',
        { kind, id: 'unauthorized-test' },
        staff,
        403,
        method,
      );
  // Changing permissions invalidates existing sessions, including on another device.
  employee = (await call('/api/accounts', undefined, admin)).data.accounts.find(
    (a) => a.id === employee.id,
  );
  await call(
    '/api/accounts',
    { ...employee, permissions: ['beans.manage', 'beans.delete'] },
    admin,
    200,
    'PATCH',
  );
  await call('/api/roastery?kind=catalog', undefined, staff, 401);
  staff = (
    await call('/api/auth', {
      action: 'login',
      username: employeeName,
      password: newPassword,
    })
  ).cookie;
  const bean = (
    await call(
      '/api/roastery',
      { kind: 'bean', name: '权限验证临时豆子' },
      staff,
      201,
    )
  ).data.id;
  await call('/api/roastery', { kind: 'bean', id: bean }, staff, 200, 'DELETE');
  await call('/api/roastery', { kind: 'inventory' }, staff, 403);
  await call(
    '/api/accounts',
    { ...employee, permissions: [] },
    admin,
    409,
    'PATCH',
  ); // stale revision
  await call('/api/auth', { action: 'logout' }, staff, 403, 'POST', {
    Origin: 'https://unrelated.example',
  });
  await call('/api/accounts', { ...employee }, admin, 403, 'PATCH', {
    Origin: 'https://unrelated.example',
  });
  employee = (await call('/api/accounts', undefined, admin)).data.accounts.find(
    (a) => a.id === employee.id,
  );
  await call(
    '/api/accounts',
    { ...employee, enabled: false },
    admin,
    200,
    'PATCH',
  );
  await call('/api/roastery?kind=catalog', undefined, staff, 401);
  await call(
    '/api/auth',
    { action: 'login', username: employeeName, password: newPassword },
    '',
    401,
  );
  employee = (await call('/api/accounts', undefined, admin)).data.accounts.find(
    (a) => a.id === employee.id,
  );
  await call(
    '/api/accounts',
    { ...employee, enabled: true, password, permissions: ['shipping.manage'] },
    admin,
    200,
    'PATCH',
  );
  await call(
    '/api/auth',
    { action: 'login', username: employeeName, password: newPassword },
    '',
    401,
  );
  const reset = (
    await call('/api/auth', {
      action: 'login',
      username: employeeName,
      password,
    })
  ).cookie;
  await call('/api/roastery?kind=catalog', undefined, reset, 403);
  await call(
    '/api/auth',
    { action: 'password', oldPassword: password, password: newPassword },
    reset,
  );
  staff = (
    await call('/api/auth', {
      action: 'login',
      username: employeeName,
      password: newPassword,
    })
  ).cookie;
  const scoped = (await call('/api/roastery?kind=operations', undefined, staff))
    .data;
  assert.deepEqual(scoped.active_orders, []);
  assert.deepEqual(scoped.movements, []);
  await call('/api/roastery', { kind: 'roast-start' }, staff, 403, 'PATCH');
  const owner = (
    await call('/api/accounts', undefined, admin)
  ).data.accounts.find((a) => a.id === bootstrap.data.user.id);
  await call(
    '/api/accounts',
    { ...owner, enabled: false },
    admin,
    400,
    'PATCH',
  );
  await call(
    '/api/accounts',
    { ...owner, role: 'employee' },
    admin,
    400,
    'PATCH',
  );
  await call('/api/auth', { action: 'logout' }, staff);
  await call('/api/roastery?kind=catalog', undefined, staff, 401);
  for (let i = 0; i < 10; i++)
    await call(
      '/api/auth',
      { action: 'login', username: 'unknown-test-user', password },
      '',
      401,
    );
  await call(
    '/api/auth',
    { action: 'login', username: 'unknown-test-user', password },
    '',
    429,
  );
  // Keep only the local admin session for the business regression suite.
  fixture.cookie = admin;
  await persist();
  console.log(
    'PASS: protected APIs, secure bootstrap, password change, scoped reads, all mutation permissions, account escalation, revocation, reset, disabled login, CSRF, version conflicts, self-lockout prevention, rate limits, logout',
  );
} finally {
  await persist();
}
