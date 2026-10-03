import {
  authDB,
  authBody,
  authJson,
  authFailure,
  currentUser,
  createSession,
  cookie,
  digest,
  sessionToken,
  publicAccount,
  hashPassword,
  verifyPassword,
  passwordValue,
  rateLimit,
  setupToken,
  secureEqual,
} from '@/lib/auth';
import { InputError, text } from '@/lib/validation';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const db = await authDB();
    const initialized = !!(await db
      .prepare('SELECT id FROM auth_bootstrap WHERE id=1')
      .first());
    let user = null;
    try {
      user = await currentUser(request, true);
    } catch (e) {
      if (!(e instanceof InputError) || e.status !== 401) throw e;
    }
    return authJson({ user, setupRequired: !initialized });
  } catch (e) {
    return authFailure(e);
  }
}
export async function POST(request: Request) {
  try {
    const b = await authBody(request);
    const db = await authDB();
    const now = new Date().toISOString();
    if (b.action === 'logout') {
      await db
        .prepare('DELETE FROM auth_sessions WHERE token_hash=?')
        .bind(digest(sessionToken(request)))
        .run();
      return authJson({ ok: true }, 200, cookie(request, '', 0));
    }
    if (b.action === 'setup' || b.action === 'login') {
      const username = text(b.username, '账户名', 40, true).toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username))
        throw new InputError(
          '账户名使用 3–40 位字母、数字、点、下划线或短横线。',
        );
      await rateLimit(request, `${b.action}:${username}`);
      const password = passwordValue(b.password);
      if (b.action === 'setup') {
        const secret = setupToken();
        if (
          !secret ||
          !secureEqual(text(b.setupToken, '初始化码', 200), secret)
        )
          throw new InputError('初始化码不正确。', 403);
        if (
          await db.prepare('SELECT id FROM auth_bootstrap WHERE id=1').first()
        )
          throw new InputError('管理员已建立，请直接登录。', 409);
        const id = crypto.randomUUID();
        const name = text(b.name, '姓名', 80, true);
        await db.batch([
          db
            .prepare('INSERT INTO auth_bootstrap(id,created_at) VALUES(1,?)')
            .bind(now),
          db
            .prepare(
              "INSERT INTO accounts(id,username,name,role,permissions,password_hash,must_change_password,created_at,updated_at) VALUES(?,?,?,'admin','[]',?,0,?,?)",
            )
            .bind(id, username, name, await hashPassword(password), now, now),
          db
            .prepare(
              'INSERT INTO account_audit(id,actor_id,target_id,action,occurred_at) VALUES(?,?,?,?,?)',
            )
            .bind(crypto.randomUUID(), id, id, 'setup', now),
        ]);
      }
      const row = await db
        .prepare('SELECT * FROM accounts WHERE username=? COLLATE NOCASE')
        .bind(username)
        .first();
      const verified = await verifyPassword(
        password,
        typeof row?.password_hash === 'string' ? row.password_hash : '',
      );
      if (!row || !verified || !row.enabled)
        throw new InputError('账户名或密码不正确，或账户已停用。', 401);
      const user = publicAccount(row);
      return authJson({ user }, 200, await createSession(request, user));
    }
    if (b.action === 'password') {
      const user = await currentUser(request, true);
      await rateLimit(request, `password:${user.id}`);
      const oldPassword = passwordValue(b.oldPassword);
      const password = passwordValue(b.password);
      if (password === oldPassword)
        throw new InputError('新密码不能与原密码相同。');
      const row = await db
        .prepare('SELECT password_hash FROM accounts WHERE id=? AND revision=?')
        .bind(user.id, user.revision)
        .first();
      if (
        !row ||
        !(await verifyPassword(oldPassword, String(row.password_hash)))
      )
        throw new InputError('原密码不正确。', 403);
      const result = await db.batch([
        db
          .prepare(
            'UPDATE accounts SET password_hash=?,must_change_password=0,revision=revision+1,updated_at=? WHERE id=? AND revision=?',
          )
          .bind(await hashPassword(password), now, user.id, user.revision),
        db
          .prepare('DELETE FROM auth_sessions WHERE account_id=?')
          .bind(user.id),
        db
          .prepare(
            'INSERT INTO account_audit(id,actor_id,target_id,action,occurred_at) VALUES(?,?,?,?,?)',
          )
          .bind(crypto.randomUUID(), user.id, user.id, 'change-password', now),
      ]);
      if (!result[0].meta.changes)
        throw new InputError('账户已更新，请重新登录。', 401);
      return authJson({ ok: true }, 200, cookie(request, '', 0));
    }
    throw new InputError('未知账户操作。', 404);
  } catch (e) {
    return authFailure(e);
  }
}
