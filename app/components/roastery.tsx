'use client';
import {
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import {
  Coffee,
  ClipboardList,
  CheckCheck,
  Bean as BeanIcon,
  Users,
  Plus,
  Search,
  ArrowUpRight,
  ArrowRight,
  Flame,
  Clock3,
  X,
  Pencil,
  SlidersHorizontal,
  Check,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChartContainer } from '@/components/ui/chart';
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import {
  statusLabels,
  timeLabel,
  type Customer,
  type Bean,
  type Profile,
  type Point,
  type RoastOrder,
  type OrderEvent,
  type Catalog,
  type Status,
} from '@/lib/model';

type View = 'orders' | 'completed' | 'beans' | 'customers';
type Modal =
  | { type: 'customer'; record?: Customer }
  | { type: 'bean'; record?: Bean }
  | { type: 'profiles'; bean: Bean }
  | { type: 'profile'; bean: Bean; record?: Profile }
  | { type: 'order' }
  | { type: 'detail'; id: string };
type Mutate = (
  method: string,
  payload: Record<string, unknown>,
  message: string,
  close?: boolean,
) => Promise<boolean>;
const api = '/api/roastery';
const views: Record<
  View,
  { title: string; subtitle: string; eyebrow: string }
> = {
  orders: {
    title: '烘焙订单',
    subtitle: '把今天的烘焙安排好，让每一张订单都有着落。',
    eyebrow: 'ROASTING WORKSPACE',
  },
  completed: {
    title: '已完成订单',
    subtitle: '每一次完成都有记录，下一次复购有据可循。',
    eyebrow: 'FINISHED WITH CARE',
  },
  beans: {
    title: '豆子档案',
    subtitle: '记住每款豆子的特点，保存适合它的烘焙方案。',
    eyebrow: 'KNOW YOUR COFFEE',
  },
  customers: {
    title: '客户档案',
    subtitle: '记下客户的偏好，把每次交付都做得更合心意。',
    eyebrow: 'PEOPLE WE ROAST FOR',
  },
};
async function request<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error('暂时无法连接，请稍后重试。');
  }
  if (!response.ok)
    throw new Error(
      data && typeof data === 'object' && 'error' in data
        ? String(data.error)
        : '操作未完成，请重试。',
    );
  return data as T;
}
function message(e: unknown) {
  return e instanceof Error ? e.message : '暂时无法连接，请稍后重试。';
}
function weight(grams: number) {
  return (
    (grams / 1000).toLocaleString('zh-CN', { maximumFractionDigits: 3 }) + ' kg'
  );
}
function stamp(s: string | null) {
  return s
    ? new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(s))
    : '—';
}
function StatusTag({ status }: { status: Status }) {
  return (
    <span className={'status-tag ' + status}>
      <span />
      {statusLabels[status]}
    </span>
  );
}
function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={'field ' + (wide ? 'field-wide' : '')}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function Curve({ points }: { points: Point[] }) {
  return (
    <div className="curve">
      <div className="curve-heading">
        <span>
          <span className="curve-dot" />
          目标豆温曲线
        </span>
        <small>计划参数 · 非机器实时采集</small>
      </div>
      <ChartContainer
        config={{ temperature: { label: '豆温', color: '#397660' } }}
        className="curve-chart"
      >
        <LineChart
          accessibilityLayer
          data={points}
          margin={{ top: 12, right: 18, bottom: 5, left: -18 }}
        >
          <CartesianGrid vertical={false} stroke="#e9eee7" />
          <XAxis
            dataKey="seconds"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={timeLabel}
            tickLine={false}
            axisLine={false}
            minTickGap={25}
          />
          <YAxis
            tickFormatter={(v) => v + '°'}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            labelFormatter={(v) => timeLabel(Number(v))}
            formatter={(v) => [v + ' ℃', '目标豆温']}
          />
          <Line
            type="linear"
            dataKey="temperature"
            stroke="#397660"
            strokeWidth={2.5}
            dot={{ r: 4, fill: '#fff' }}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}
function ProfileSummary({ profile }: { profile: Profile }) {
  return (
    <>
      <div className="profile-facts">
        <span>
          烘焙度<strong>{profile.roast_level}</strong>
        </span>
        <span>
          方案投豆量<strong>{weight(profile.batch_grams)}</strong>
        </span>
        <span>
          目标时长
          <strong>{timeLabel(profile.points.at(-1)?.seconds || 0)}</strong>
        </span>
        <span>
          烘焙机<strong>{profile.machine || '未填写'}</strong>
        </span>
      </div>
      <Curve points={profile.points} />
      <div className="point-summary">
        <Table>
          <TableHeader>
            <TableRow>
              {['阶段', '时间', '豆温', '火力', '风门'].map((t) => (
                <TableHead key={t}>{t}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {profile.points.map((p, i) => (
              <TableRow key={i}>
                <TableCell>{p.stage}</TableCell>
                <TableCell>{timeLabel(p.seconds)}</TableCell>
                <TableCell>{p.temperature} ℃</TableCell>
                <TableCell>{p.power}%</TableCell>
                <TableCell>{p.fan}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {profile.notes && <p className="notes">{profile.notes}</p>}
    </>
  );
}

export default function Roastery({ view = 'orders' }: { view?: View }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [catalogError, setCatalogError] = useState(''),
    [revision, setRevision] = useState(0);
  const [modal, setModal] = useState<Modal | null>(null),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState(''),
    [toast, setToast] = useState('');
  const lock = useRef(false);
  const [filter, setFilter] = useState('all'),
    [q, setQ] = useState(''),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(1);
  const [list, setList] = useState<{
      orders: RoastOrder[];
      total: number;
    } | null>(null),
    [listError, setListError] = useState(''),
    [loading, setLoading] = useState(true);
  const isOrders = view === 'orders' || view === 'completed';
  const status = view === 'completed' ? 'completed' : filter;
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setCatalogError('');
    });
    request<Catalog>(api + '?kind=catalog', { signal: controller.signal })
      .then(setCatalog)
      .catch((e) => {
        if (!controller.signal.aborted) setCatalogError(message(e));
      });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    if (!isOrders) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setLoading(true);
        setListError('');
      }
    });
    request<{ orders: RoastOrder[]; total: number }>(
      api +
        '?' +
        new URLSearchParams({
          kind: 'orders',
          status,
          q: search,
          page: String(page),
        }),
      { signal: controller.signal },
    )
      .then((data) => {
        setList(data);
        setLoading(false);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setListError(message(e));
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [isOrders, status, search, page, revision]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  function open(m: Modal) {
    setFormError('');
    setModal(m);
  }
  const mutate: Mutate = async (method, payload, success, close = true) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setFormError('');
    try {
      await request(api, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setToast(success);
      setRevision((v) => v + 1);
      if (close) setModal(null);
      return true;
    } catch (e) {
      setFormError(message(e));
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  function newOrder() {
    open({ type: 'order' });
  }
  const count = catalog?.stats;
  const details = views[view];
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <Coffee size={30} />
          <span>
            企鹅烘焙<span className="brand-sub">PENGUIN ROASTORY</span>
          </span>
        </Link>
        <p className="nav-label">烘焙工作台</p>
        <nav aria-label="主导航">
          {(
            [
              { view: 'orders', url: '/', icon: ClipboardList },
              { view: 'completed', url: '/completed', icon: CheckCheck },
              { view: 'beans', url: '/beans', icon: BeanIcon },
              { view: 'customers', url: '/customers', icon: Users },
            ] as const
          ).map((n) => (
            <Link
              key={n.view}
              className={'nav-item ' + (view === n.view ? 'active' : '')}
              href={n.url}
              aria-current={view === n.view ? 'page' : undefined}
            >
              <n.icon />
              {views[n.view].title}
              {n.view === 'orders' &&
                count &&
                count.waiting + count.roasting > 0 && (
                  <span className="nav-count">
                    {count.waiting + count.roasting}
                  </span>
                )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="online-dot" />
          每一锅，都有迹可循。<small>从一张订单开始，认真烘好每一批豆。</small>
        </div>
      </aside>
      <main className="main">
        <div className="topline">
          <span>工作台 / {details.title}</span>
          <span>基础版本 · 不管理库存</span>
        </div>
        <header className="page-header">
          <div>
            <p className="eyebrow">{details.eyebrow}</p>
            <h1>
              {details.title}
              <span className="heading-dot">.</span>
            </h1>
            <p className="subtitle">{details.subtitle}</p>
          </div>
          <Button
            className="primary-action"
            onClick={() =>
              view === 'beans'
                ? open({ type: 'bean' })
                : view === 'customers'
                  ? open({ type: 'customer' })
                  : newOrder()
            }
          >
            <Plus />
            {view === 'beans'
              ? '新增豆子'
              : view === 'customers'
                ? '新增客户'
                : '新建订单'}
          </Button>
        </header>
        {catalogError && (
          <div role="alert" className="error-banner">
            {catalogError}
            <Button variant="outline" onClick={() => setRevision((v) => v + 1)}>
              重试
            </Button>
          </div>
        )}
        {view === 'orders' && (
          <section className="stats" aria-label="订单概况">
            {(
              [
                {
                  status: 'waiting',
                  icon: Clock3,
                  note: '准备好，下一锅就出发',
                },
                { status: 'roasting', icon: Flame, note: '专注当下这一锅' },
                {
                  status: 'completed',
                  icon: CheckCheck,
                  note: '每一次完成，都值得记录',
                },
              ] as const
            ).map((s) => (
              <button
                className={'stat ' + (filter === s.status ? 'selected' : '')}
                onClick={() => {
                  setFilter(s.status);
                  setPage(1);
                }}
                key={s.status}
              >
                <span>
                  <s.icon size={17} />
                  {statusLabels[s.status]}
                </span>
                <strong>
                  {count ? count[s.status] : '—'}
                  <small>单</small>
                </strong>
                <p>{s.note}</p>
              </button>
            ))}
          </section>
        )}
        {view === 'completed' && (
          <div className="completion-note">
            <CheckCheck size={25} />
            <div>
              <strong>
                {count ? count.completed : '—'} 张订单，已完成交付
              </strong>
              <p>保留客户、豆子和当时的烘焙参数，随时回看。</p>
            </div>
          </div>
        )}
        {isOrders ? (
          <section className="panel">
            <div className="panel-heading">
              <h2>
                {view === 'completed' ? '完成记录' : '订单清单'}{' '}
                <span className="count-pill">{list?.total ?? '—'}</span>
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRevision((v) => v + 1)}
                disabled={loading}
              >
                <RefreshCw size={14} />
                刷新
              </Button>
            </div>
            <div className="toolbar">
              {view === 'orders' && (
                <div className="filter-tabs" aria-label="按订单状态筛选">
                  {(['all', 'waiting', 'roasting', 'completed'] as const).map(
                    (s) => (
                      <button
                        aria-pressed={filter === s}
                        className={filter === s ? 'active' : ''}
                        onClick={() => {
                          setFilter(s);
                          setPage(1);
                        }}
                        key={s}
                      >
                        {s === 'all' ? '全部订单' : statusLabels[s]}
                      </button>
                    ),
                  )}
                </div>
              )}
              <div className="search-box">
                <Search size={16} />
                <Input
                  aria-label="搜索订单、客户或豆子"
                  placeholder="搜索订单、客户或豆子…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                {q && (
                  <button onClick={() => setQ('')} aria-label="清空搜索">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
            {listError ? (
              <div className="empty-state" role="alert">
                <h3>订单暂时没有加载出来</h3>
                <p>{listError}</p>
                <Button
                  variant="outline"
                  onClick={() => setRevision((v) => v + 1)}
                >
                  再试一次
                </Button>
              </div>
            ) : loading ? (
              <output className="loading-state">正在读取烘焙记录…</output>
            ) : list?.orders.length ? (
              <>
                <Table className="orders-table">
                  <TableHeader>
                    <TableRow>
                      {[
                        '订单 / 客户',
                        '豆子与烘焙方案',
                        '熟豆数量',
                        view === 'completed' ? '完成时间' : '交付日期',
                        '状态',
                        '操作',
                      ].map((t) => (
                        <TableHead key={t}>{t}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.orders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell>
                          <button
                            className="order-link"
                            onClick={() => open({ type: 'detail', id: o.id })}
                          >
                            {o.code}
                          </button>
                          <span className="cell-sub">{o.customer_name}</span>
                        </TableCell>
                        <TableCell>
                          <strong className="cell-title">{o.bean_name}</strong>
                          <span className="cell-sub">
                            {o.profile_snapshot.name} ·{' '}
                            {o.profile_snapshot.roast_level}
                          </span>
                        </TableCell>
                        <TableCell className="quantity">
                          {weight(o.quantity_grams)}
                        </TableCell>
                        <TableCell>
                          {view === 'completed'
                            ? stamp(o.completed_at)
                            : o.due_date || '未指定'}
                        </TableCell>
                        <TableCell>
                          <StatusTag status={o.status} />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant={
                              o.status === 'completed' ? 'ghost' : 'outline'
                            }
                            size="sm"
                            onClick={() => open({ type: 'detail', id: o.id })}
                          >
                            {o.status === 'waiting'
                              ? '开始烘焙'
                              : o.status === 'roasting'
                                ? '完成订单'
                                : '查看记录'}
                            <ArrowUpRight size={13} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="pagination">
                  <span>
                    共 {list.total} 张订单 · 第 {page} /{' '}
                    {Math.max(1, Math.ceil(list.total / 20))} 页
                  </span>
                  <div>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="上一页"
                      disabled={page === 1}
                      onClick={() => setPage((v) => v - 1)}
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="下一页"
                      disabled={page * 20 >= list.total}
                      onClick={() => setPage((v) => v + 1)}
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state">
                {view === 'completed' ? (
                  <CheckCheck size={38} />
                ) : (
                  <ClipboardList size={38} />
                )}
                <h3>
                  {q || (filter !== 'all' && view === 'orders')
                    ? '没有找到符合条件的订单'
                    : view === 'completed'
                      ? '完成的订单，会留在这里'
                      : '从第一张烘焙订单开始'}
                </h3>
                <p>
                  {q || (filter !== 'all' && view === 'orders')
                    ? '试试其他关键词，或切换订单状态。'
                    : view === 'completed'
                      ? '在订单里标记完成后，就能在这里回看。'
                      : '先记下客户和豆子，再选好烘焙方案。'}
                </p>
                {!q && filter === 'all' && view === 'orders' && (
                  <Button className="primary-action" onClick={newOrder}>
                    创建第一张订单
                    <ArrowUpRight />
                  </Button>
                )}
              </div>
            )}
          </section>
        ) : (
          <>
            <div className="catalog-toolbar">
              <span>
                {view === 'beans' ? '豆子与它的烘焙方案' : '一起认真做咖啡的人'}{' '}
                <span className="count-pill">
                  {catalog
                    ? view === 'beans'
                      ? catalog.beans.length
                      : catalog.customers.length
                    : '—'}
                </span>
              </span>
              <div className="search-box">
                <Search size={16} />
                <Input
                  aria-label={view === 'beans' ? '搜索豆子' : '搜索客户'}
                  placeholder={
                    view === 'beans'
                      ? '搜索豆子、产地、处理法…'
                      : '搜索客户、联系人…'
                  }
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            </div>
            {!catalog ? (
              <div className="loading-state">正在读取档案…</div>
            ) : view === 'beans' ? (
              <div className="catalog-grid">
                {catalog.beans
                  .filter((b) =>
                    (b.name + b.origin + b.process + b.variety + b.notes)
                      .toLowerCase()
                      .includes(q.toLowerCase()),
                  )
                  .map((b, i) => (
                    <article className="bean-card" key={b.id}>
                      <div className={'bean-card-top tone-' + (i % 3)}>
                        <span className="bean-symbol">
                          <BeanIcon size={30} strokeWidth={1.2} />
                        </span>
                        <span className="bean-origin">
                          {b.origin || '产地待补充'}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={'编辑' + b.name}
                          onClick={() => open({ type: 'bean', record: b })}
                        >
                          <Pencil size={15} />
                        </Button>
                      </div>
                      <div className="bean-card-body">
                        <h2>{b.name}</h2>
                        <div className="chips">
                          <span>{b.process || '处理法待补充'}</span>
                          {b.variety && <span>{b.variety}</span>}
                        </div>
                        <p className="catalog-notes">
                          {b.notes || '还没有风味备注，随时记下你的观察。'}
                        </p>
                        <div className="card-bottom">
                          <span>
                            {
                              catalog.profiles.filter((p) => p.bean_id === b.id)
                                .length
                            }{' '}
                            套烘焙方案
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => open({ type: 'profiles', bean: b })}
                          >
                            管理方案
                            <ArrowRight size={14} />
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
                {catalog.beans.filter((b) =>
                  (b.name + b.origin + b.process + b.variety + b.notes)
                    .toLowerCase()
                    .includes(q.toLowerCase()),
                ).length === 0 && (
                  <div className="panel empty-state full-width">
                    <BeanIcon size={38} />
                    <h3>{q ? '没有找到这款豆子' : '先认识你的第一款豆子'}</h3>
                    <p>记下豆子的名字和特点，再给它添加烘焙方案。</p>
                    <Button
                      className="primary-action"
                      onClick={() => open({ type: 'bean' })}
                    >
                      <Plus />
                      新增豆子
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <section className="panel">
                {catalog.customers.filter((c) =>
                  (c.name + c.contact + c.phone + c.notes)
                    .toLowerCase()
                    .includes(q.toLowerCase()),
                ).length ? (
                  <Table className="customers-table">
                    <TableHeader>
                      <TableRow>
                        {[
                          '客户名称',
                          '联系人',
                          '联系方式',
                          '口味偏好与备注',
                          '',
                        ].map((t, i) => (
                          <TableHead key={i}>{t}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {catalog.customers
                        .filter((c) =>
                          (c.name + c.contact + c.phone + c.notes)
                            .toLowerCase()
                            .includes(q.toLowerCase()),
                        )
                        .map((c) => (
                          <TableRow key={c.id}>
                            <TableCell>
                              <span className="customer-name">
                                <span className="avatar">
                                  {c.name.slice(0, 1)}
                                </span>
                                <strong>{c.name}</strong>
                              </span>
                            </TableCell>
                            <TableCell>{c.contact || '—'}</TableCell>
                            <TableCell>{c.phone || '—'}</TableCell>
                            <TableCell className="wrap-notes">
                              {c.notes || '还没有备注'}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  open({ type: 'customer', record: c })
                                }
                              >
                                <Pencil size={14} />
                                编辑
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="empty-state">
                    <Users size={38} />
                    <h3>{q ? '没有找到这个客户' : '记下你的第一位客户'}</h3>
                    <p>记录客户和口味偏好，新订单可以直接选择。</p>
                    <Button
                      className="primary-action"
                      onClick={() => open({ type: 'customer' })}
                    >
                      <Plus />
                      新增客户
                    </Button>
                  </div>
                )}
              </section>
            )}
          </>
        )}
        <footer className="page-footer">
          PENGUIN ROASTORY <span>认真烘焙，简单记录。</span>
        </footer>
      </main>
      {toast && (
        <output className="toast">
          <Check size={17} />
          {toast}
          <button aria-label="关闭提示" onClick={() => setToast('')}>
            <X size={14} />
          </button>
        </output>
      )}
      <Dialog
        open={!!modal}
        onOpenChange={(openState) => {
          if (!openState && !busy) {
            setModal(null);
            setFormError('');
          }
        }}
      >
        <DialogContent
          className={
            'roast-dialog ' +
            (modal?.type === 'profile' || modal?.type === 'detail'
              ? 'wide-dialog'
              : '')
          }
        >
          <DialogHeader>
            <DialogTitle>
              {modal?.type === 'customer'
                ? modal.record
                  ? '编辑客户'
                  : '新增客户'
                : modal?.type === 'bean'
                  ? modal.record
                    ? '编辑豆子'
                    : '新增豆子'
                  : modal?.type === 'profiles'
                    ? modal.bean.name + ' · 烘焙方案'
                    : modal?.type === 'profile'
                      ? modal.record
                        ? '编辑烘焙方案'
                        : '新增烘焙方案'
                      : modal?.type === 'order'
                        ? '新建烘焙订单'
                        : '订单详情'}
            </DialogTitle>
            <DialogDescription>
              {modal?.type === 'order'
                ? '选好客户、豆子和方案，安排这次烘焙。'
                : modal?.type === 'profile'
                  ? '记录你自己的目标参数。保存方案不会更改历史订单。'
                  : modal?.type === 'profiles'
                    ? '同一款豆子，可以保存不同的烘焙方案。'
                    : modal?.type === 'detail'
                      ? '从开始到完成，留下这张订单的烘焙记录。'
                      : '先记录必要信息，其他内容可以随时补充。'}
            </DialogDescription>
          </DialogHeader>
          {formError && (
            <div role="alert" className="form-error">
              {formError}
            </div>
          )}
          {(modal?.type === 'customer' || modal?.type === 'bean') && (
            <CatalogForm
              key={modal.type + (modal.record?.id || 'new')}
              modal={modal}
              busy={busy}
              mutate={mutate}
            />
          )}
          {modal?.type === 'profiles' && catalog && (
            <div className="profiles-list">
              {catalog.profiles
                .filter((p) => p.bean_id === modal.bean.id)
                .map((p) => (
                  <div className="profile-card" key={p.id}>
                    <div>
                      <h3>
                        {p.name}
                        <small>v{p.revision}</small>
                      </h3>
                      <span>
                        {p.roast_level} · 投豆 {weight(p.batch_grams)} ·{' '}
                        {timeLabel(p.points.at(-1)?.seconds || 0)}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        open({ type: 'profile', bean: modal.bean, record: p })
                      }
                    >
                      查看 / 编辑
                    </Button>
                  </div>
                ))}
              {catalog.profiles.filter((p) => p.bean_id === modal.bean.id)
                .length === 0 && (
                <p className="hint">
                  这款豆子还没有烘焙方案。先添加一套，就可以创建订单。
                </p>
              )}
              <Button
                className="primary-action"
                onClick={() => open({ type: 'profile', bean: modal.bean })}
              >
                <Plus />
                新增烘焙方案
              </Button>
            </div>
          )}
          {modal?.type === 'profile' && (
            <ProfileForm
              key={modal.record?.id || 'new'}
              bean={modal.bean}
              profile={modal.record}
              busy={busy}
              mutate={mutate}
              onBack={() => open({ type: 'profiles', bean: modal.bean })}
            />
          )}
          {modal?.type === 'order' &&
            (catalog ? (
              <OrderForm
                catalog={catalog}
                busy={busy}
                mutate={mutate}
                open={open}
              />
            ) : (
              <p className="hint">正在读取客户和豆子档案…</p>
            ))}
          {modal?.type === 'detail' && (
            <OrderDetail
              id={modal.id}
              revision={revision}
              busy={busy}
              mutate={mutate}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function CatalogForm({
  modal,
  busy,
  mutate,
}: {
  modal: Extract<Modal, { type: 'customer' | 'bean' }>;
  busy: boolean;
  mutate: Mutate;
}) {
  const r = modal.record;
  const customer = modal.type === 'customer' ? modal.record : undefined;
  const bean = modal.type === 'bean' ? modal.record : undefined;
  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    await mutate(
      r ? 'PATCH' : 'POST',
      { ...data, kind: modal.type, ...(r ? { id: r.id } : {}) },
      modal.type === 'customer' ? '客户档案已保存' : '豆子档案已保存',
    );
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={busy} className="form-grid">
        <Field
          label={modal.type === 'customer' ? '客户名称 *' : '豆子名称 *'}
          wide
        >
          <Input
            name="name"
            required
            maxLength={100}
            defaultValue={r?.name}
            placeholder={
              modal.type === 'customer'
                ? '例如：街角咖啡馆'
                : '例如：埃塞俄比亚 耶加雪菲'
            }
          />
        </Field>
        {modal.type === 'customer' ? (
          <>
            <Field label="联系人">
              <Input
                name="contact"
                maxLength={100}
                defaultValue={customer?.contact}
                placeholder="怎么称呼对方"
              />
            </Field>
            <Field label="联系方式">
              <Input
                name="phone"
                maxLength={60}
                defaultValue={customer?.phone}
                placeholder="电话或微信"
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="产地">
              <Input
                name="origin"
                maxLength={100}
                defaultValue={bean?.origin}
                placeholder="国家 / 产区 / 庄园"
              />
            </Field>
            <Field label="处理法">
              <Input
                name="process"
                maxLength={100}
                defaultValue={bean?.process}
                placeholder="水洗、日晒、蜜处理…"
              />
            </Field>
            <Field label="品种" wide>
              <Input
                name="variety"
                maxLength={100}
                defaultValue={bean?.variety}
                placeholder="例如：瑰夏、卡杜拉"
              />
            </Field>
          </>
        )}
        <Field
          label={
            modal.type === 'customer' ? '口味偏好与备注' : '风味特点与备注'
          }
          wide
        >
          <Textarea
            name="notes"
            maxLength={2000}
            rows={3}
            defaultValue={r?.notes}
            placeholder={
              modal.type === 'customer'
                ? '偏好的风味、冲煮方式或特别要求…'
                : '记下香气、风味或这款豆子的特点…'
            }
          />
        </Field>
        <div className="form-actions field-wide">
          <span>* 为必填项</span>
          <Button type="submit" className="primary-action">
            {busy ? '正在保存…' : '保存档案'}
            <Check size={16} />
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
type DraftPoint = {
  stage: string;
  time: string;
  temperature: string;
  power: string;
  fan: string;
};
function ProfileForm({
  bean,
  profile,
  busy,
  mutate,
  onBack,
}: {
  bean: Bean;
  profile?: Profile;
  busy: boolean;
  mutate: Mutate;
  onBack: () => void;
}) {
  const [points, setPoints] = useState<DraftPoint[]>(
    profile
      ? profile.points.map((p) => ({
          stage: p.stage,
          time: timeLabel(p.seconds),
          temperature: String(p.temperature),
          power: String(p.power),
          fan: String(p.fan),
        }))
      : ['入豆', '回温', '转黄', '一爆', '下豆'].map((stage, i) => ({
          stage,
          time: i === 0 ? '0:00' : '',
          temperature: '',
          power: '',
          fan: '',
        })),
  );
  const [error, setError] = useState('');
  function seconds(time: string) {
    if (!/^\d{1,3}:[0-5]\d$/.test(time))
      throw new Error('时间请填写为分:秒，例如 1:30。');
    const [m, s] = time.split(':').map(Number);
    return m * 60 + s;
  }
  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    try {
      const data = Object.fromEntries(new FormData(e.currentTarget));
      await mutate(
        profile ? 'PATCH' : 'POST',
        {
          ...data,
          kind: 'profile',
          bean_id: bean.id,
          batch_grams: Math.round(Number(data.batch_kg) * 1000),
          points: points.map((p) => ({
            stage: p.stage,
            seconds: seconds(p.time),
            temperature: p.temperature,
            power: p.power,
            fan: p.fan,
          })),
          ...(profile ? { id: profile.id, revision: profile.revision } : {}),
        },
        '烘焙方案已保存',
      );
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <form onSubmit={submit}>
      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}
      <fieldset disabled={busy} className="form-grid">
        <Field label="方案名称 *">
          <Input
            name="name"
            defaultValue={profile?.name}
            placeholder="例如：手冲浅烘 · 第一次调整"
            required
            maxLength={100}
          />
        </Field>
        <Field label="烘焙度 *">
          <NativeSelect
            name="roast_level"
            defaultValue={profile?.roast_level || ''}
            required
          >
            <option value="" disabled>
              选择烘焙度
            </option>
            {['浅烘焙', '中浅烘焙', '中烘焙', '中深烘焙', '深烘焙'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="方案投豆量（生豆 kg）*">
          <Input
            name="batch_kg"
            type="number"
            min="0.001"
            max="1000"
            step="0.001"
            defaultValue={profile ? profile.batch_grams / 1000 : undefined}
            placeholder="这一锅投入多少生豆"
            required
          />
        </Field>
        <Field label="烘焙机">
          <Input
            name="machine"
            maxLength={100}
            defaultValue={profile?.machine}
            placeholder="设备名称或型号"
          />
        </Field>
        <div className="field-wide">
          <div className="section-label">
            <h3>曲线关键点</h3>
            <span>时间格式：分:秒，如 1:30</span>
          </div>
          <p className="hint">
            按你的设备填写目标豆温、火力和风门。首点为 0:00，其余时间依次增加。
          </p>
          <div className="point-editor">
            <div className="point-editor-head">
              <span>阶段</span>
              <span>时间</span>
              <span>豆温 ℃</span>
              <span>火力 %</span>
              <span>风门 %</span>
              <span />
            </div>
            {points.map((p, i) => (
              <div className="point-row" key={i}>
                {(
                  ['stage', 'time', 'temperature', 'power', 'fan'] as const
                ).map((k) => (
                  <Input
                    key={k}
                    aria-label={
                      '第' +
                      (i + 1) +
                      '点' +
                      {
                        stage: '阶段',
                        time: '时间',
                        temperature: '豆温',
                        power: '火力',
                        fan: '风门',
                      }[k]
                    }
                    required
                    maxLength={k === 'stage' ? 30 : undefined}
                    type={
                      ['temperature', 'power', 'fan'].includes(k)
                        ? 'number'
                        : 'text'
                    }
                    min="0"
                    max={k === 'temperature' ? 350 : 100}
                    step="0.1"
                    pattern={k === 'time' ? '[0-9]{1,3}:[0-5][0-9]' : undefined}
                    placeholder={k === 'time' ? '1:30' : undefined}
                    value={p[k]}
                    onChange={(e) =>
                      setPoints((items) =>
                        items.map((x, index) =>
                          index === i ? { ...x, [k]: e.target.value } : x,
                        ),
                      )
                    }
                  />
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={'删除第' + (i + 1) + '个点'}
                  disabled={points.length <= 2}
                  onClick={() =>
                    setPoints((items) => items.filter((_, j) => j !== i))
                  }
                >
                  <X size={14} />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={points.length >= 30}
            onClick={() =>
              setPoints((p) => [
                ...p,
                { stage: '', time: '', temperature: '', power: '', fan: '' },
              ])
            }
          >
            <Plus size={14} />
            增加一个记录点
          </Button>
        </div>
        <Field label="方案备注" wide>
          <Textarea
            name="notes"
            maxLength={2000}
            defaultValue={profile?.notes}
            placeholder="其他操作提醒或调整原因…"
          />
        </Field>
        <div className="form-actions field-wide">
          <Button variant="ghost" type="button" onClick={onBack}>
            返回方案列表
          </Button>
          <Button className="primary-action" type="submit">
            {busy ? '正在保存…' : '保存烘焙方案'}
            <Check size={16} />
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
function OrderForm({
  catalog,
  busy,
  mutate,
  open,
}: {
  catalog: Catalog;
  busy: boolean;
  mutate: Mutate;
  open: (m: Modal) => void;
}) {
  const [beanId, setBeanId] = useState(''),
    [profileId, setProfileId] = useState(''),
    [requestId] = useState(() => crypto.randomUUID());
  const profiles = catalog.profiles.filter((p) => p.bean_id === beanId);
  const selected = profiles.find((p) => p.id === profileId);
  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    await mutate(
      'POST',
      {
        ...data,
        kind: 'order',
        id: requestId,
        bean_id: beanId,
        profile_id: profileId,
        quantity_grams: Math.round(Number(data.quantity_kg) * 1000),
      },
      '订单已创建，正在等待烘焙',
    );
  }
  if (!catalog.customers.length || !catalog.beans.length)
    return (
      <div className="setup-notice">
        <p>先记下客户和豆子，新订单就能直接选用。</p>
        <div>
          <Button variant="outline" onClick={() => open({ type: 'customer' })}>
            <Users size={16} />
            {catalog.customers.length ? '继续添加客户' : '先添加一位客户'}
          </Button>
          <Button variant="outline" onClick={() => open({ type: 'bean' })}>
            <BeanIcon size={16} />
            {catalog.beans.length ? '继续添加豆子' : '先添加一款豆子'}
          </Button>
        </div>
        <p className="hint">保存后，再点击“新建订单”继续。</p>
      </div>
    );
  return (
    <form onSubmit={submit}>
      <fieldset disabled={busy} className="form-grid">
        <Field label="客户 *" wide>
          <NativeSelect name="customer_id" required defaultValue="">
            <option value="" disabled>
              选择这张订单的客户
            </option>
            {catalog.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="豆子 *" wide>
          <NativeSelect
            value={beanId}
            required
            onChange={(e) => {
              setBeanId(e.target.value);
              setProfileId('');
            }}
          >
            <option value="" disabled>
              选择要烘焙的豆子
            </option>
            {catalog.beans.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="烘焙方案 *" wide>
          <NativeSelect
            value={profileId}
            required
            disabled={!beanId}
            onChange={(e) => setProfileId(e.target.value)}
          >
            <option value="" disabled>
              {beanId ? '选择已保存的烘焙方案' : '请先选择豆子'}
            </option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.roast_level}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {beanId && !profiles.length && (
          <div className="setup-notice field-wide">
            这款豆子还没有烘焙方案。
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                open({
                  type: 'profile',
                  bean: catalog.beans.find((b) => b.id === beanId)!,
                })
              }
            >
              <Plus />
              先添加方案
            </Button>
            <small>保存后重新打开新建订单。</small>
          </div>
        )}
        {selected && (
          <div className="selected-profile field-wide">
            <div>
              <SlidersHorizontal size={16} />
              <strong>{selected.name}</strong>
              <span>v{selected.revision}</span>
            </div>
            <p>
              投豆 {weight(selected.batch_grams)} · 目标{' '}
              {timeLabel(selected.points.at(-1)?.seconds || 0)} · 下豆{' '}
              {selected.points.at(-1)?.temperature} ℃
            </p>
            <Curve points={selected.points} />
          </div>
        )}
        <Field label="订购数量（熟豆 kg）*">
          <Input
            name="quantity_kg"
            type="number"
            required
            min="0.001"
            max="100000"
            step="0.001"
            placeholder="交给客户的熟豆净重"
          />
        </Field>
        <Field label="交付日期">
          <Input name="due_date" type="date" />
        </Field>
        <Field label="订单备注" wide>
          <Textarea
            name="notes"
            maxLength={2000}
            placeholder="包装要求、特别提醒…"
          />
        </Field>
        <div className="hint field-wide">
          订购数量是熟豆重量，方案投豆量是每锅生豆重量；本版不计算库存。
        </div>
        <div className="form-actions field-wide">
          <span>创建后为“等待烘焙”</span>
          <Button type="submit" className="primary-action" disabled={!selected}>
            {busy ? '正在创建…' : '创建订单'}
            <ArrowRight size={16} />
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
function OrderDetail({
  id,
  revision,
  busy,
  mutate,
}: {
  id: string;
  revision: number;
  busy: boolean;
  mutate: Mutate;
}) {
  const [data, setData] = useState<{
      order: RoastOrder;
      events: OrderEvent[];
    } | null>(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    queueMicrotask(() => {
      if (!c.signal.aborted) setError('');
    });
    request<{ order: RoastOrder; events: OrderEvent[] }>(
      api + '?' + new URLSearchParams({ kind: 'detail', id }),
      { signal: c.signal },
    )
      .then(setData)
      .catch((e) => {
        if (!c.signal.aborted) setError(message(e));
      });
    return () => c.abort();
  }, [id, revision, retry]);
  if (error)
    return (
      <div role="alert" className="form-error">
        {error}
        <Button variant="outline" onClick={() => setRetry((v) => v + 1)}>
          重试
        </Button>
      </div>
    );
  if (!data) return <div className="loading-state">正在读取订单…</div>;
  const o = data.order;
  return (
    <div className="order-detail">
      <div className="detail-title">
        <span>{o.code}</span>
        <StatusTag status={o.status} />
      </div>
      <div className="detail-facts">
        <span>
          客户<strong>{o.customer_name}</strong>
        </span>
        <span>
          豆子<strong>{o.bean_name}</strong>
        </span>
        <span>
          订购熟豆<strong>{weight(o.quantity_grams)}</strong>
        </span>
        <span>
          交付日期<strong>{o.due_date || '未指定'}</strong>
        </span>
      </div>
      {o.notes && <p className="notes">{o.notes}</p>}
      <div className="section-label">
        <h3>{o.profile_snapshot.name}</h3>
        <span>下单时保存 · v{o.profile_snapshot.revision}</span>
      </div>
      <ProfileSummary profile={o.profile_snapshot} />
      <div className="order-timeline" aria-label="订单进度">
        {(['waiting', 'roasting', 'completed'] as Status[]).map((s) => {
          const event = data.events.find((e) => e.status === s);
          return (
            <div key={s} className={event ? 'done' : ''}>
              <span className="timeline-dot">
                {event ? <Check size={11} /> : null}
              </span>
              <strong>
                {s === 'waiting'
                  ? '订单创建'
                  : s === 'roasting'
                    ? '开始烘焙'
                    : '完成交付'}
              </strong>
              <small>{event ? stamp(event.occurred_at) : '尚未完成'}</small>
            </div>
          );
        })}
      </div>
      <div className="detail-action">
        {o.status === 'completed' ? (
          <p>
            <CheckCheck size={18} />
            这张订单已完成，并已归入“已完成订单”。
          </p>
        ) : (
          <>
            <p>
              {o.status === 'waiting'
                ? '准备好了，就开始这张订单的烘焙。'
                : '确认烘焙及交付已完成后，再标记完成。'}
            </p>
            <Button
              className="primary-action"
              disabled={busy}
              onClick={() =>
                mutate(
                  'PATCH',
                  {
                    kind: 'status',
                    id: o.id,
                    status: o.status === 'waiting' ? 'roasting' : 'completed',
                  },
                  o.status === 'waiting'
                    ? '订单已开始烘焙'
                    : '订单已完成，已记录交付',
                  false,
                )
              }
            >
              {busy ? (
                '正在保存…'
              ) : o.status === 'waiting' ? (
                <>
                  <Flame size={16} />
                  开始烘焙
                </>
              ) : (
                <>
                  <CheckCheck size={16} />
                  标记完成 / 已交付
                </>
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
