import { env } from 'cloudflare:workers';
import { scrypt, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { getD1 } from '@/db';
import { InputError } from '@/lib/validation';
import { can, type Account, type Permission } from '@/lib/permissions';

let ready: Promise<unknown> | undefined;
export async function authDB() {
  const db = await getD1();
  if (!ready)
    ready = db
      .batch([
        db.prepare(
          `CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', role TEXT NOT NULL CHECK(role IN ('admin','employee')), permissions TEXT NOT NULL DEFAULT '[]', enabled INTEGER NOT NULL DEFAULT 1, must_change_password INTEGER NOT NULL DEFAULT 1, password_hash TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), revision INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
        ),
        db.prepare(
          `CREATE INDEX IF NOT EXISTS auth_sessions_account ON auth_sessions(account_id)`,
        ),
        db.prepare(
          `CREATE TRIGGER IF NOT EXISTS accounts_revision BEFORE UPDATE ON accounts WHEN NEW.revision!=OLD.revision+1 BEGIN SELECT RAISE(ABORT,'ACCOUNT_CONFLICT'); END`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS auth_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS auth_bootstrap (id INTEGER PRIMARY KEY CHECK(id=1), created_at TEXT NOT NULL)`,
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS account_audit (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, target_id TEXT NOT NULL, action TEXT NOT NULL, occurred_at TEXT NOT NULL)`,
        ),
        db.prepare(
          `CREATE TRIGGER IF NOT EXISTS accounts_last_admin_update BEFORE UPDATE ON accounts WHEN OLD.role='admin' AND OLD.enabled=1 AND (NEW.role!='admin' OR NEW.enabled!=1) AND (SELECT COUNT(*) FROM accounts WHERE role='admin' AND enabled=1)=1 BEGIN SELECT RAISE(ABORT,'LAST_ADMIN'); END`,
        ),
        db.prepare(
          `CREATE TRIGGER IF NOT EXISTS accounts_last_admin_delete BEFORE DELETE ON accounts WHEN OLD.role='admin' AND OLD.enabled=1 AND (SELECT COUNT(*) FROM accounts WHERE role='admin' AND enabled=1)=1 BEGIN SELECT RAISE(ABORT,'LAST_ADMIN'); END`,
        ),
      ])
      .catch((e) => {
        ready = undefined;
        throw e;
      });
  await ready;
  return db;
}
export function publicAccount(row: Record<string, unknown>): Account {
  return {
    id: String(row.id),
    username: String(row.username),
    name: String(row.name),
    phone: typeof row.phone === 'string' ? row.phone : '',
    email: typeof row.email === 'string' ? row.email : '',
    role: row.role as Account['role'],
    permissions: JSON.parse(
      typeof row.permissions === 'string' ? row.permissions : '[]',
    ),
    enabled: !!row.enabled,
    must_change_password: !!row.must_change_password,
    revision: Number(row.revision),
    created_at: String(row.created_at),
  };
}
export function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
export function secureEqual(a: string, b: string) {
  return timingSafeEqual(
    Buffer.from(digest(a), 'hex'),
    Buffer.from(digest(b), 'hex'),
  );
}
export function passwordValue(input: unknown) {
  if (typeof input !== 'string' || input.length < 12 || input.length > 128)
    throw new InputError('密码需为 12–128 个字符，可使用中文或短语。');
  return input;
}
function derive(password: string, salt: string): Promise<Buffer> {
  // OWASP's 16 MiB scrypt configuration; supported by Workers node:crypto.
  return new Promise((resolve, reject) =>
    scrypt(
      password,
      salt,
      32,
      { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 },
      (e, key) => (e ? reject(e) : resolve(key)),
    ),
  );
}
export async function hashPassword(value: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:16384:8:5:${salt}:${(await derive(value, salt)).toString('hex')}`;
}
export async function verifyPassword(value: string, encoded: string) {
  const parts = encoded.split(':');
  const valid =
    parts.length === 6 &&
    parts.slice(0, 4).join(':') === 'scrypt:16384:8:5' &&
    /^[a-f0-9]{64}$/.test(parts[5]);
  const key = await derive(
    value,
    valid ? parts[4] : '00000000000000000000000000000000',
  );
  return (
    timingSafeEqual(
      key,
      Buffer.from(valid ? parts[5] : '0'.repeat(64), 'hex'),
    ) && valid
  );
}
function cookieName(request: Request) {
  return new URL(request.url).protocol === 'https:'
    ? '__Host-roastory_session'
    : 'roastory_session';
}
export function sessionToken(request: Request) {
  const name = cookieName(request);
  return (
    (request.headers.get('cookie') || '')
      .split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith(name + '='))
      ?.slice(name.length + 1) || ''
  );
}
export function cookie(request: Request, token: string, maxAge = 43200) {
  return `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export async function createSession(request: Request, user: Account) {
  const db = await authDB();
  const token = randomBytes(32).toString('hex');
  await db.batch([
    db.prepare('DELETE FROM auth_sessions WHERE expires_at<?').bind(Date.now()),
    db
      .prepare(
        'INSERT INTO auth_sessions(token_hash,account_id,revision,expires_at) VALUES(?,?,?,?)',
      )
      .bind(digest(token), user.id, user.revision, Date.now() + 43200000),
  ]);
  return cookie(request, token);
}
export async function currentUser(
  request: Request,
  allowPasswordChange = false,
) {
  const token = sessionToken(request);
  if (!/^[a-f0-9]{64}$/.test(token)) throw new InputError('请先登录。', 401);
  const db = await authDB();
  const row = await db
    .prepare(
      'SELECT a.* FROM accounts a JOIN auth_sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>? AND s.revision=a.revision AND a.enabled=1',
    )
    .bind(digest(token), Date.now())
    .first();
  if (!row) throw new InputError('登录已失效，请重新登录。', 401);
  const user = publicAccount(row);
  if (user.must_change_password && !allowPasswordChange)
    throw new InputError('请先更换临时密码。', 403);
  return user;
}
export function requirePermission(user: Account, ...permissions: Permission[]) {
  if (!permissions.some((p) => can(user, p)))
    throw new InputError('没有此操作权限，请联系管理员。', 403);
}
export function requireAdmin(user: Account) {
  if (user.role !== 'admin')
    throw new InputError('只有管理员可以管理账户。', 403);
}
export async function authBody(request: Request) {
  const raw = await request.text();
  if (raw.length > 12000) throw new InputError('提交内容过长。', 413);
  if (
    (request.headers.get('origin') &&
      request.headers.get('origin') !== new URL(request.url).origin) ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    throw new InputError('请从本站页面提交操作。', 403);
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new InputError('提交格式不正确。', 415);
  try {
    const b = JSON.parse(raw);
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw 0;
    return b as Record<string, unknown>;
  } catch {
    throw new InputError('提交格式不正确。');
  }
}
export async function rateLimit(request: Request, subject: string, limit = 10) {
  const db = await authDB();
  const now = Date.now();
  const end = (Math.floor(now / 900000) + 1) * 900000;
  const keys = [
    `ip:${request.headers.get('cf-connecting-ip') || 'local'}:${subject.split(':')[0]}`,
    subject,
  ];
  for (const key of keys) {
    const row = await db
      .prepare(
        `INSERT INTO auth_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,expires_at=? RETURNING count`,
      )
      .bind(digest(key), end, now, end)
      .first<{ count: number }>();
    if (Number(row?.count) > (key.startsWith('ip:') ? limit * 3 : limit))
      throw new InputError('尝试过于频繁，请 15 分钟后重试。', 429);
  }
  await db
    .prepare('DELETE FROM auth_limits WHERE expires_at<?')
    .bind(now)
    .run();
}
export function setupToken() {
  return String(
    (env as unknown as { AUTH_SETUP_TOKEN?: string }).AUTH_SETUP_TOKEN || '',
  );
}
export function authJson(data: unknown, status = 200, sessionCookie?: string) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      Vary: 'Cookie',
      ...(sessionCookie ? { 'Set-Cookie': sessionCookie } : {}),
    },
  });
}
export function authFailure(e: unknown) {
  if (e instanceof InputError) return authJson({ error: e.message }, e.status);
  const detail = String(e);
  if (detail.includes('LAST_ADMIN'))
    return authJson({ error: '必须保留至少一位启用的管理员。' }, 409);
  if (detail.includes('ACCOUNT_CONFLICT'))
    return authJson({ error: '账户已被其他管理员修改，请刷新后重试。' }, 409);
  if (detail.includes('UNIQUE') || detail.includes('auth_bootstrap'))
    return authJson(
      { error: '账户名已存在，或初始管理员已建立，请刷新后重试。' },
      409,
    );
  console.error('Account operation failed');
  return authJson({ error: '账户操作暂时未能完成，请重试。' }, 500);
}
