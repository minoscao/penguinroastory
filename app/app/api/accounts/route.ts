import {
  authDB,
  authBody,
  authJson,
  authFailure,
  currentUser,
  requireAdmin,
  publicAccount,
  hashPassword,
  passwordValue,
} from '@/lib/auth';
import { normalizePermissions } from '@/lib/permissions';
import { InputError, text, number } from '@/lib/validation';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    requireAdmin(await currentUser(request));
    const db = await authDB();
    const rows = await db
      .prepare(
        'SELECT id,username,name,phone,email,role,permissions,enabled,must_change_password,revision,created_at FROM accounts ORDER BY created_at,id',
      )
      .all();
    return authJson({ accounts: rows.results.map(publicAccount) });
  } catch (e) {
    return authFailure(e);
  }
}
async function save(request: Request, creating: boolean) {
  try {
    const actor = await currentUser(request);
    requireAdmin(actor);
    const b = await authBody(request);
    const db = await authDB();
    const now = new Date().toISOString();
    const id = creating ? crypto.randomUUID() : text(b.id, '账户', 80, true);
    const username = text(b.username, '账户名', 40, true).toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username))
      throw new InputError(
        '账户名使用 3–40 位字母、数字、点、下划线或短横线。',
      );
    const name = text(b.name, '姓名', 80, true),
      phone = text(b.phone, '联系方式', 80),
      email = text(b.email, '邮箱', 160);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new InputError('邮箱格式不正确。');
    if (!['admin', 'employee'].includes(String(b.role)))
      throw new InputError('角色无效。');
    if (typeof b.enabled !== 'boolean') throw new InputError('账户状态无效。');
    let permissions;
    try {
      permissions = normalizePermissions(b.permissions);
    } catch {
      throw new InputError('权限选项无效。');
    }
    if (id === actor.id && (b.role !== 'admin' || !b.enabled || b.password))
      throw new InputError(
        '不能停用或降级自己；修改自己的密码请使用“修改密码”。',
      );
    const existing = creating
      ? null
      : await db.prepare('SELECT * FROM accounts WHERE id=?').bind(id).first();
    if (!creating && !existing) throw new InputError('账户不存在。', 404);
    const revision = creating
      ? 1
      : number(b.revision, '账户版本', 1, 100000000, true) + 1;
    const passwordHash =
      creating || b.password
        ? await hashPassword(passwordValue(b.password))
        : String(existing?.password_hash);
    const forceChange =
      creating || b.password ? 1 : Number(existing?.must_change_password);
    const query = creating
      ? db
          .prepare(
            'INSERT INTO accounts(id,username,name,phone,email,role,permissions,enabled,password_hash,must_change_password,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
          )
          .bind(
            id,
            username,
            name,
            phone,
            email,
            b.role,
            JSON.stringify(permissions),
            b.enabled ? 1 : 0,
            passwordHash,
            forceChange,
            revision,
            now,
            now,
          )
      : db
          .prepare(
            'UPDATE accounts SET username=?,name=?,phone=?,email=?,role=?,permissions=?,enabled=?,password_hash=?,must_change_password=?,revision=?,updated_at=? WHERE id=?',
          )
          .bind(
            username,
            name,
            phone,
            email,
            b.role,
            JSON.stringify(permissions),
            b.enabled ? 1 : 0,
            passwordHash,
            forceChange,
            revision,
            now,
            id,
          );
    await db.batch([
      query,
      db.prepare('DELETE FROM auth_sessions WHERE account_id=?').bind(id),
      db
        .prepare(
          'INSERT INTO account_audit(id,actor_id,target_id,action,occurred_at) VALUES(?,?,?,?,?)',
        )
        .bind(
          crypto.randomUUID(),
          actor.id,
          id,
          creating
            ? 'create'
            : b.password
              ? 'reset-password'
              : 'update-account',
          now,
        ),
    ]);
    return authJson({ id }, creating ? 201 : 200);
  } catch (e) {
    return authFailure(e);
  }
}
export const POST = (request: Request) => save(request, true);
export const PATCH = (request: Request) => save(request, false);
