'use client';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  type ComponentProps,
  type SyntheticEvent,
} from 'react';
// Use full document navigation, matching the existing operational shell.
function Link({ children, ...props }: ComponentProps<'a'>) {
  return <a {...props}>{children}</a>;
}
import { usePathname } from 'next/navigation';
import {
  can,
  routePermission,
  type Account,
  type Permission,
} from '@/lib/permissions';
const AuthContext = createContext<{
  user: Account | null;
  can: (p: Permission) => boolean;
  refresh: () => Promise<void>;
}>({ user: null, can: () => false, refresh: async () => {} });
export const useAuth = () => useContext(AuthContext);
export async function authRequest<T = Record<string, unknown>>(
  path: string,
  payload?: unknown,
  method = 'POST',
) {
  const r = await fetch(path, {
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
    method: payload === undefined ? 'GET' : method,
    ...(payload === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
  });
  const data = (await r.json()) as Record<string, unknown>;
  if (!r.ok) {
    if (r.status === 401)
      window.dispatchEvent(new Event('roastory-auth-change'));
    throw new Error(
      typeof data.error === 'string' ? data.error : '操作未完成，请重试。',
    );
  }
  return data as T;
}
export function SessionBar() {
  const { user, refresh } = useAuth();
  const [error, setError] = useState('');
  return (
    <div className="account-bar">
      <span>
        {user?.name} · {user?.role === 'admin' ? '管理员' : '普通员工'}
      </span>
      <div>
        <Link href="/">工作台</Link>
        {user?.role === 'admin' && <Link href="/accounts">账户管理</Link>}
        <Link href="/account">修改密码</Link>
        <button
          type="button"
          onClick={async () => {
            try {
              await authRequest('/api/auth', { action: 'logout' });
              await refresh();
            } catch {
              setError('退出未完成，请重试。');
            }
          }}
        >
          退出登录
        </button>
      </div>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
export default function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    user: Account | null;
    setupRequired: boolean;
  } | null>(null);
  const [error, setError] = useState('');
  const path = usePathname();
  const refresh = useCallback(async () => {
    try {
      const data = await authRequest<{
        user: Account | null;
        setupRequired: boolean;
      }>('/api/auth');
      setState(data);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法连接账户服务。');
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => void refresh());
    const interval = setInterval(() => void refresh(), 60000);
    const focus = () => void refresh();
    window.addEventListener('focus', focus);
    window.addEventListener('roastory-auth-change', focus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', focus);
      window.removeEventListener('roastory-auth-change', focus);
    };
  }, [refresh]);
  if (!state)
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>企鹅烘焙</h1>
          <output>{error || '正在检查登录状态…'}</output>
          {error && <button onClick={() => void refresh()}>重新连接</button>}
        </div>
      </main>
    );
  const user = state.user;
  const denied =
    user &&
    (path === '/accounts'
      ? user.role !== 'admin'
      : routePermission[path] && !can(user, routePermission[path]));
  return (
    <AuthContext.Provider value={{ user, can: (p) => can(user, p), refresh }}>
      {!user ? (
        <LoginForm setup={state.setupRequired} onDone={refresh} />
      ) : user.must_change_password || path === '/account' ? (
        <PasswordForm forced={user.must_change_password} />
      ) : denied ? (
        <main className="account-page">
          <SessionBar />
          <div className="auth-card">
            <h1>此页面尚未授权</h1>
            <p>请联系管理员调整账户权限。</p>
            <Link href="/">返回工作台</Link>
          </div>
        </main>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}
function LoginForm({
  setup,
  onDone,
}: {
  setup: boolean;
  onDone: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    if (setup && form.get('password') !== form.get('confirm')) {
      setError('两次输入的密码不一致。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await authRequest('/api/auth', {
        action: setup ? 'setup' : 'login',
        ...Object.fromEntries(form),
      });
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <p className="auth-eyebrow">PENGUIN ROASTORY</p>
        <h1>{setup ? '建立管理员账户' : '登录企鹅烘焙'}</h1>
        <p>
          {setup
            ? '使用店主初始化码建立首位管理员。现有业务资料不会改变。'
            : '使用管理员为你分配的账户登录。'}
        </p>
        {setup && (
          <>
            <label>
              初始化码
              <input
                name="setupToken"
                type="password"
                autoComplete="off"
                required
                maxLength={200}
              />
            </label>
            <label>
              姓名
              <input name="name" autoComplete="name" required maxLength={80} />
            </label>
          </>
        )}
        <label>
          账户名
          <input
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,39}"
            title="3–40 位字母、数字、点、下划线或短横线"
            required
            maxLength={40}
          />
        </label>
        <label>
          密码
          <input
            name="password"
            type="password"
            autoComplete={setup ? 'new-password' : 'current-password'}
            minLength={12}
            maxLength={128}
            required
          />
        </label>
        {setup && (
          <>
            <label>
              确认密码
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </label>
            <small>密码至少 12 个字符，可使用易记的长短语。</small>
          </>
        )}
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button className="auth-primary" disabled={busy}>
          {busy ? '正在处理…' : setup ? '建立管理员并登录' : '登录'}
        </button>
        {!setup && (
          <small>忘记密码请联系管理员重置。此系统不开放自行注册。</small>
        )}
      </form>
    </main>
  );
}
function PasswordForm({ forced }: { forced: boolean }) {
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    if (f.get('password') !== f.get('confirm')) {
      setError('两次输入的密码不一致。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await authRequest('/api/auth', {
        action: 'password',
        oldPassword: f.get('oldPassword'),
        password: f.get('password'),
      });
      window.location.assign('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : '修改未完成。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>{forced ? '设置自己的密码' : '修改密码'}</h1>
        <p>
          {forced
            ? '临时密码仅用于首次登录。更换后才可进入工作台。'
            : '修改后，所有设备需要用新密码重新登录。'}
        </p>
        <label>
          {forced ? '临时密码' : '原密码'}
          <input
            name="oldPassword"
            type="password"
            autoComplete="current-password"
            required
            minLength={12}
            maxLength={128}
          />
        </label>
        <label>
          新密码
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
          />
        </label>
        <label>
          确认新密码
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
          />
        </label>
        <small>至少 12 个字符，可使用中文或长短语。</small>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button className="auth-primary" disabled={busy}>
          {busy ? '正在保存…' : '保存密码并重新登录'}
        </button>
        {!forced && <Link href="/">返回工作台</Link>}
        <button
          type="button"
          onClick={async () => {
            try {
              await authRequest('/api/auth', { action: 'logout' });
              await refresh();
            } catch {
              setError('退出未完成，请重试。');
            }
          }}
        >
          退出登录
        </button>
      </form>
    </main>
  );
}
