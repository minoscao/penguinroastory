'use client';
import { useState, useEffect, type SyntheticEvent } from 'react';
import { authRequest, SessionBar, useAuth } from '@/components/auth-provider';
import {
  permissionGroups,
  normalizePermissions,
  type Account,
  type Permission,
} from '@/lib/permissions';
export default function Accounts() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Account[]>([]),
    [editing, setEditing] = useState<Account | 'new' | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  async function load() {
    try {
      setRows(
        (await authRequest<{ accounts: Account[] }>('/api/accounts')).accounts,
      );
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取失败。');
    }
  }
  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);
  return (
    <main className="account-page">
      <SessionBar />
      <header className="account-heading">
        <div>
          <h1>账户管理</h1>
          <p>管理员拥有全部权限；员工只可进入已授权的业务。</p>
        </div>
        <button
          className="auth-primary"
          onClick={() => {
            setEditing('new');
            setNotice('');
          }}
        >
          新增账户
        </button>
      </header>
      {error && (
        <p role="alert" className="auth-error">
          {error}
          <button onClick={() => void load()}>重试</button>
        </p>
      )}
      {notice && <output className="account-notice">{notice}</output>}
      {editing !== null ? (
        <AccountForm
          key={typeof editing === 'string' ? 'new' : editing.id}
          account={editing === 'new' ? null : editing}
          selfId={user?.id || ''}
          onCancel={() => setEditing(null)}
          onSaved={async () => {
            const self =
              typeof editing !== 'string' && editing?.id === user?.id;
            setEditing(null);
            setNotice('账户已保存。该账户原有登录已失效，请重新登录。');
            if (self) {
              window.location.reload();
              return;
            }
            await load();
          }}
        />
      ) : (
        <div className="account-table-wrap">
          <table className="account-table">
            <thead>
              <tr>
                <th>姓名 / 账户名</th>
                <th>角色</th>
                <th>状态</th>
                <th>授权业务</th>
                <th>联系方式</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.name}</strong>
                    <small>
                      {a.username}
                      {a.id === user?.id ? ' · 当前账户' : ''}
                    </small>
                  </td>
                  <td>{a.role === 'admin' ? '管理员' : '普通员工'}</td>
                  <td>
                    {a.enabled ? '启用' : '停用'}
                    {a.must_change_password && <small>待修改临时密码</small>}
                  </td>
                  <td>
                    {a.role === 'admin'
                      ? '全部权限'
                      : permissionGroups
                          .filter((g) =>
                            a.permissions.includes(`${g.key}.view`),
                          )
                          .map((g) => g.name)
                          .join('、') || '暂无授权'}
                  </td>
                  <td>{a.phone || a.email || '—'}</td>
                  <td>
                    <button
                      onClick={() => {
                        setEditing(a);
                        setNotice('');
                      }}
                    >
                      编辑账户
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && !error && <p>正在读取账户…</p>}
        </div>
      )}
    </main>
  );
}
function AccountForm({
  account,
  selfId,
  onSaved,
  onCancel,
}: {
  account: Account | null;
  selfId: string;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [role, setRole] = useState<Account['role']>(
    account?.role || 'employee',
  );
  const [permissions, setPermissions] = useState<Permission[]>(
    account?.permissions || [],
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const self = account?.id === selfId;
  function toggle(permission: Permission, checked: boolean) {
    const key = permission.split('.')[0];
    setPermissions((previous) =>
      checked
        ? normalizePermissions([...previous, permission])
        : previous.filter(
            (p) =>
              p !== permission &&
              (!permission.endsWith('.view') || !p.startsWith(key + '.')),
          ),
    );
  }
  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await authRequest(
        '/api/accounts',
        {
          ...Object.fromEntries(f),
          id: account?.id,
          revision: account?.revision,
          role,
          enabled: f.get('enabled') === 'on',
          permissions,
        },
        account ? 'PATCH' : 'POST',
      );
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="account-form" onSubmit={submit}>
      <div className="account-heading">
        <h2>{account ? '编辑账户' : '新增账户'}</h2>
        <button type="button" onClick={onCancel} disabled={busy}>
          返回账户列表
        </button>
      </div>
      <div className="account-fields">
        <label>
          姓名
          <input
            name="name"
            defaultValue={account?.name}
            required
            maxLength={80}
          />
        </label>
        <label>
          登录账户名
          <input
            name="username"
            defaultValue={account?.username}
            autoComplete="off"
            autoCapitalize="none"
            required
            pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,39}"
            title="3–40 位字母、数字、点、下划线或短横线"
            maxLength={40}
          />
        </label>
        <label>
          联系方式
          <input name="phone" defaultValue={account?.phone} maxLength={80} />
        </label>
        <label>
          邮箱
          <input
            name="email"
            type="email"
            defaultValue={account?.email}
            maxLength={160}
          />
        </label>
        <label>
          角色
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Account['role'])}
            disabled={self}
          >
            <option value="employee">普通员工</option>
            <option value="admin">管理员 · 全部权限</option>
          </select>
        </label>
        {!self && (
          <label>
            {account ? '重置临时密码（留空则不修改）' : '临时密码'}
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required={!account}
              minLength={12}
              maxLength={128}
            />
            <small>至少 12 个字符。员工登录后必须更换。</small>
          </label>
        )}
      </div>
      <label className="account-check">
        <input
          name="enabled"
          type="checkbox"
          defaultChecked={account?.enabled ?? true}
          disabled={self}
        />
        {self && <input name="enabled" type="hidden" value="on" />}启用账户
      </label>
      <p>停用、重置密码或修改权限后，该账户的所有旧登录会立即失效。</p>
      <h3>业务权限</h3>
      {role === 'admin' ? (
        <p className="account-notice">
          管理员可以使用全部业务，并管理其他账户。
        </p>
      ) : (
        <>
          <p>
            “操作”包含新增、编辑和业务处理；删除客户、豆子需单独授权。勾选操作会同时开启查看权限。
          </p>
          <div className="permission-grid">
            <div className="permission-header">业务</div>
            <div className="permission-header">查看</div>
            <div className="permission-header">操作</div>
            <div className="permission-header">删除</div>
            {permissionGroups.map((g) => (
              <div className="permission-row" key={g.key}>
                <strong>{g.name}</strong>
                {(['view', 'manage', 'delete'] as const).map((action) => (
                  <div key={action}>
                    {(g.actions as readonly string[]).includes(action) ? (
                      <input
                        type="checkbox"
                        aria-label={`${g.name}：${action === 'view' ? '查看' : action === 'manage' ? '操作' : '删除'}`}
                        checked={permissions.includes(`${g.key}.${action}`)}
                        onChange={(e) =>
                          toggle(`${g.key}.${action}`, e.target.checked)
                        }
                      />
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <footer className="account-form-footer">
        <button type="button" onClick={onCancel} disabled={busy}>
          取消
        </button>
        <button className="auth-primary" disabled={busy}>
          {busy ? '正在保存…' : '保存账户'}
        </button>
      </footer>
    </form>
  );
}
