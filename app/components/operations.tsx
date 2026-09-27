'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Boxes,
  CheckCheck,
  ClipboardList,
  Delete,
  Flame,
  History,
  PackageCheck,
  Plus,
  Scale,
  Send,
  ScanLine,
  Thermometer,
  TimerReset,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChartContainer } from '@/components/ui/chart';
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import type {
  BeanSku,
  Catalog,
  Profile,
  RoastRecord,
  RoastRecordPoint,
  RoastOrder,
  Shipment,
  StockMovement,
} from '@/lib/model';

type RoastBatch = {
  key: string;
  orders: RoastOrder[];
  startedAt: number | null;
  machine: string;
  session?: RoastSession;
};

type RecordedPoint = RoastRecordPoint;

type RoastProgress = {
  chargedGrams: number;
  targetGrams: number;
  machine: string;
};

type ConfirmedTarget = RoastRecord['target'];

type RoastSession = RoastRecord & {
  /** A session exists only after the beans have actually entered the roaster. */
  isRecording?: true;
};

const roastTargets = [
  { value: 'first-start', label: '一爆初段出豆', level: '浅烘焙' },
  { value: 'first-middle', label: '一爆中段出豆', level: '中烘焙' },
  { value: 'first-end', label: '一爆末段出豆', level: '中深烘焙' },
  { value: 'second-middle', label: '二爆中段出豆', level: '深烘焙' },
  { value: 'second-end', label: '二爆末段出豆', level: '极深烘焙' },
] as const;

type OperationsData = {
  active_orders: RoastOrder[];
  completed_orders: RoastOrder[];
  shipments: Shipment[];
  movements: (StockMovement & { sku_label?: string; bean_name?: string })[];
};

type Props = {
  view: 'roasting' | 'fulfillment' | 'admin';
  catalog: Catalog | null;
  source: string;
  dateFilter?: string;
  revision: number;
  onChanged: (notice: string) => void;
};

async function callApi<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(
      typeof data.error === 'string' ? data.error : '操作没有完成，请重试。',
    );
  return data as T;
}

function kg(grams: number) {
  return Math.round(grams).toLocaleString('zh-CN') + ' g';
}

function time(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(value))
    : '—';
}

function skuName(sku: BeanSku | undefined, order?: RoastOrder) {
  return sku?.label || order?.sku_snapshot?.label || '旧订单 · 批次待补充';
}

export default function OperationsPanel({
  view,
  catalog,
  source,
  dateFilter = '',
  revision,
  onChanged,
}: Props) {
  const [data, setData] = useState<OperationsData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [roastMode, setRoastMode] = useState<'bean' | 'customer'>('bean');
  const [roastBatch, setRoastBatch] = useState<RoastBatch | null>(null);
  const [roastProgress, setRoastProgress] = useState<Record<string, RoastProgress>>({});
  const [roastSessions, setRoastSessions] = useState<Record<string, RoastSession>>({});
  const [shipmentOrder, setShipmentOrder] = useState<RoastOrder | 'sample' | null>(null);
  const [inventorySku, setInventorySku] = useState<BeanSku | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setError('');
    });
    callApi<OperationsData>(
      '/api/roastery?' + new URLSearchParams({ kind: 'operations', source, date: dateFilter }),
      { signal: controller.signal },
    )
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '读取失败');
      });
    return () => controller.abort();
  }, [source, dateFilter, revision, reload]);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const stored = window.localStorage.getItem('penguin-roast-progress');
        if (stored) setRoastProgress(JSON.parse(stored) as Record<string, RoastProgress>);
        const sessions = window.localStorage.getItem('penguin-roast-sessions');
        if (sessions) setRoastSessions(JSON.parse(sessions) as Record<string, RoastSession>);
      } catch {
        // The roasting screen remains usable if this browser cannot save local progress.
      }
    });
  }, []);

  async function mutate(payload: Record<string, unknown>, notice: string, method = 'PATCH') {
    if (busy) return false;
    setBusy(true);
    setError('');
    try {
      await callApi('/api/roastery', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setReload((value) => value + 1);
      onChanged(notice);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作没有完成，请重试。');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const startBatch = useCallback((orders: RoastOrder[]) => {
    setRoastBatch({
      key: orders.map((order) => order.id).join('-'),
      orders,
      startedAt: null,
      machine: 'Sandouke 600',
    });
  }, []);

  const resumeBatch = useCallback((orders: RoastOrder[]) => {
    const key = orders.map((order) => order.id).join('-');
    const stored = roastSessions[key];
    // Older versions saved a timer as soon as the console was opened.  That can
    // make a preparation screen look as if it has been roasting for hours.
    // Only sessions explicitly marked as recording are allowed to continue.
    const session = stored?.isRecording === true &&
      Number.isFinite(stored.startedAt) &&
      stored.startedAt <= Date.now() &&
      Date.now() - stored.startedAt <= 3 * 60 * 60 * 1000
      ? stored
      : undefined;
    if (stored && !session) {
      setRoastSessions((current) => {
        const next = { ...current };
        delete next[key];
        try {
          window.localStorage.setItem('penguin-roast-sessions', JSON.stringify(next));
        } catch {
          // A stale local timer must never block a new physical roast.
        }
        return next;
      });
    }
    setRoastBatch({
      key,
      orders,
      startedAt: session?.startedAt ?? null,
      machine: session?.machine || roastProgress[key]?.machine || 'Sandouke 600',
      session,
    });
  }, [roastProgress, roastSessions]);

  useEffect(() => {
    if (view !== 'roasting' || !data || roastBatch) return;
    const orderId = new URLSearchParams(window.location.search).get('order');
    if (!orderId) return;

    // The order archive can send a roaster directly to the recording console.
    // Clear the hand-off address immediately so closing the console returns to
    // the normal board instead of opening it again.
    window.history.replaceState({}, '', window.location.pathname);
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const order = [...data.active_orders, ...data.completed_orders].find((item) => item.id === orderId);
      if (!order) {
        setError('没有找到这张订单，无法打开烘焙记录台。');
        return;
      }
      if (order.status === 'completed') {
        const stored = order.roast_record;
        const fallbackTarget: ConfirmedTarget = {
          temperature: String(order.profile_snapshot.points.at(-1)?.temperature || ''),
          label: '后期补录',
          level: order.profile_snapshot.roast_level,
          machine: order.profile_snapshot.machine || 'Sandouke 600',
          profileId: order.profile_snapshot.id,
          profileName: order.profile_snapshot.name,
        };
        const parsedStartedAt = Date.parse(order.started_at || order.completed_at || '');
        const session: RoastSession = stored
          ? { ...stored, isRecording: true }
          : {
              startedAt: Number.isFinite(parsedStartedAt) ? parsedStartedAt : Date.now(),
              machine: fallbackTarget.machine,
              chargedGrams: 0,
              target: fallbackTarget,
              records: [],
              isRecording: true,
            };
        setRoastBatch({
          key: order.id,
          orders: [order],
          startedAt: session.startedAt,
          machine: session.machine,
          session,
        });
        return;
      }
      const otherRoast = data.active_orders.find(
        (item) => item.status === 'roasting' && item.id !== order.id,
      );
      if (otherRoast) {
        setError(`Sandouke 600 正在烘焙 ${otherRoast.code}，请结束当前这一锅后再开始。`);
        return;
      }
      if (order.status === 'roasting') resumeBatch([order]);
      else startBatch([order]);
    });
    return () => {
      cancelled = true;
    };
  }, [data, roastBatch, resumeBatch, startBatch, view]);

  const saveSession = useCallback((key: string, session: RoastSession) => {
    setRoastSessions((current) => {
      const next = { ...current, [key]: session };
      try {
        window.localStorage.setItem('penguin-roast-sessions', JSON.stringify(next));
      } catch {
        // The live batch still stays open even if browser storage is unavailable.
      }
      return next;
    });
  }, []);

  async function beginBatch(chargedGrams: number, machine: string, draft: Omit<RoastSession, 'startedAt' | 'machine' | 'chargedGrams' | 'isRecording'>) {
    if (!roastBatch) return null;
    const startedAt = Date.now();
    const alreadyRoasting = roastBatch.orders.every((order) => order.status === 'roasting');
    const ok = alreadyRoasting || await mutate(
      { kind: 'batch-status', id: roastBatch.orders[0].id, ids: roastBatch.orders.map((order) => order.id), status: 'roasting' },
      `已开始 ${roastBatch.orders.length} 张合并订单`,
    );
    if (!ok) return null;
    const progress = {
      chargedGrams,
      targetGrams: roastBatch.orders.reduce((sum, order) => sum + order.quantity_grams, 0),
      machine,
    };
    setRoastProgress((current) => {
      const next = { ...current, [roastBatch.key]: progress };
      try {
        window.localStorage.setItem('penguin-roast-progress', JSON.stringify(next));
      } catch {
        // The active console still keeps the current batch visible in this session.
      }
      return next;
    });
    const session = { ...draft, startedAt, machine, chargedGrams, isRecording: true as const };
    saveSession(roastBatch.key, session);
    setRoastBatch((current) => current ? { ...current, startedAt, machine, session } : current);
    return startedAt;
  }

  async function saveRoastRecord(batch: RoastBatch, session: RoastSession, notice: string) {
    return mutate(
      {
        kind: 'roast-record',
        ids: batch.orders.map((order) => order.id),
        record: {
          startedAt: session.startedAt,
          machine: session.machine,
          chargedGrams: session.chargedGrams,
          target: session.target,
          records: session.records,
        },
      },
      notice,
    );
  }

  async function finishBatch(session: RoastSession) {
    if (!roastBatch) return;
    const saved = await saveRoastRecord(roastBatch, session, '烘焙曲线已保存');
    if (!saved) return;
    const ok = await mutate(
      {
        kind: 'batch-status',
        id: roastBatch.orders[0].id,
        ids: roastBatch.orders.map((order) => order.id),
        status: 'completed',
      },
      `已完成 ${roastBatch.orders.length} 张合并订单的烘焙`,
    );
    if (ok) setRoastBatch(null);
  }

  if (error && !data)
    return (
      <div className="panel operation-empty" role="alert">
        <Warehouse size={38} />
        <h2>工作台暂时没有加载出来</h2>
        <p>{error}</p>
        <Button variant="outline" onClick={() => setReload((value) => value + 1)}>
          再试一次
        </Button>
      </div>
    );
  if (!data || !catalog) return <div className="panel loading-state">正在整理今天的工作…</div>;

  return (
    <>
      {error && <div className="error-banner">{error}</div>}
      {view === 'roasting' && (
        <RoastingBoard
          data={data}
          catalog={catalog}
          mode={roastMode}
          setMode={setRoastMode}
          busy={busy}
          startBatch={startBatch}
          resumeBatch={resumeBatch}
          roastProgress={roastProgress}
        />
      )}
      {view === 'fulfillment' && (
        <FulfillmentBoard
          data={data}
          busy={busy}
          openShipment={setShipmentOrder}
          delivered={(id) =>
            mutate({ kind: 'shipment-status', id, status: 'delivered' }, '已记录客户签收')
          }
        />
      )}
      {view === 'admin' && (
        <AdminBoard data={data} catalog={catalog} openInventory={setInventorySku} />
      )}

      <Dialog open={!!shipmentOrder} onOpenChange={(open) => !open && setShipmentOrder(null)}>
        <DialogContent className="roast-dialog">
          <DialogHeader>
            <DialogTitle>{shipmentOrder === 'sample' ? '登记样品发货' : '登记订单发货'}</DialogTitle>
            <DialogDescription>填写快递信息后，这次发货会进入物流记录。</DialogDescription>
          </DialogHeader>
          {shipmentOrder && (
            <ShipmentForm
              order={shipmentOrder}
              busy={busy}
              submit={async (payload) => {
                const ok = await mutate(payload, '发货信息已保存', 'POST');
                if (ok) setShipmentOrder(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!inventorySku} onOpenChange={(open) => !open && setInventorySku(null)}>
        <DialogContent className="roast-dialog">
          <DialogHeader>
            <DialogTitle>调整库存</DialogTitle>
            <DialogDescription>
              {inventorySku?.label} · 当前 {kg(inventorySku?.stock_grams || 0)}
            </DialogDescription>
          </DialogHeader>
          {inventorySku && (
            <InventoryForm
              sku={inventorySku}
              busy={busy}
              submit={async (payload) => {
                const ok = await mutate(payload, '库存已经更新', 'POST');
                if (ok) setInventorySku(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!roastBatch} onOpenChange={(open) => !open && setRoastBatch(null)}>
        <DialogContent className="roast-console-dialog">
          {roastBatch && (
            <RoastConsole
              batch={roastBatch}
              busy={busy}
              begin={beginBatch}
              finish={finishBatch}
              saveCorrection={(session) => saveRoastRecord(roastBatch, session, '烘焙曲线已修正')}
              saveSession={saveSession}
              profiles={catalog.profiles.filter((profile) => profile.bean_id === roastBatch.orders[0].bean_id && !profile.id.startsWith('pending-profile-'))}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RoastingBoard({
  data,
  catalog,
  mode,
  setMode,
  busy,
  startBatch,
  resumeBatch,
  roastProgress,
}: {
  data: OperationsData;
  catalog: Catalog;
  mode: 'bean' | 'customer';
  setMode: (mode: 'bean' | 'customer') => void;
  busy: boolean;
  startBatch: (orders: RoastOrder[]) => void;
  resumeBatch: (orders: RoastOrder[]) => void;
  roastProgress: Record<string, RoastProgress>;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, RoastOrder[]>();
    for (const order of data.active_orders) {
      const key = [order.status, order.sku_id || order.bean_id].join('|');
      map.set(key, [...(map.get(key) || []), order]);
    }
    return [...map.values()];
  }, [data.active_orders]);
  const waiting = data.active_orders.filter((order) => order.status === 'waiting').length;
  const currentRoasting = groups.find((orders) => orders[0].status === 'roasting');
  const currentRoastingKey = currentRoasting?.map((order) => order.id).join('-');
  const visibleGroups = groups.filter((orders) =>
    orders[0].status === 'waiting' || orders.map((order) => order.id).join('-') === currentRoastingKey,
  );
  return (
    <>
      <div className="operation-stats">
        <div className="operation-stat"><span><Boxes />等待安排</span><strong>{waiting}</strong><small>张订单</small></div>
        <div className="operation-stat accent"><span><Flame />正在烘焙</span><strong>{currentRoasting ? 1 : 0}</strong><small>{currentRoasting ? '台机器' : '台机器'}</small></div>
        <div className="operation-stat"><span><Scale />今日待处理</span><strong>{kg(data.active_orders.reduce((sum, order) => sum + order.quantity_grams, 0))}</strong><small>订单总重量</small></div>
      </div>
      <section className="panel">
        <div className="panel-heading operation-heading">
          <div><h2>烘焙安排</h2><p>相同豆子批次会自动放在一起；本锅烘焙方案在开始时决定。</p></div>
          <div className="view-switch" aria-label="查看方式">
            <button className={mode === 'bean' ? 'active' : ''} onClick={() => setMode('bean')}>按豆子合并</button>
            <button className={mode === 'customer' ? 'active' : ''} onClick={() => setMode('customer')}>按客户查看</button>
          </div>
        </div>
        {data.active_orders.length === 0 ? (
          <div className="operation-empty"><CheckCheck size={40} /><h2>今天的烘焙已经安排完了</h2><p>新订单会自动出现在这里。</p></div>
        ) : mode === 'bean' ? (
          <div className="roast-groups">
            {visibleGroups.map((orders) => {
              const first = orders[0];
              const sku = catalog.skus.find((item) => item.id === first.sku_id);
              const total = orders.reduce((sum, order) => sum + order.quantity_grams, 0);
              const batchKey = orders.map((order) => order.id).join('-');
              const progress = roastProgress[batchKey];
              const remaining = Math.max(0, total - (progress?.chargedGrams || 0));
              const extra = Math.max(0, (progress?.chargedGrams || 0) - total);
              return (
                <article className="roast-group" key={[first.status, first.sku_id || first.bean_id].join('-')}>
                  <div className={'group-icon ' + first.status}>{first.status === 'waiting' ? <Boxes /> : <Flame />}</div>
                  <div className="group-main">
                    <div className="group-title"><strong>{first.bean_name}</strong><span>{skuName(sku, first)}</span></div>
                    <p>{first.status === 'waiting' ? '开始本锅时选择烘焙方案' : '本锅烘焙进行中'} · {orders.length} 位客户</p>
                    <div className="customer-chips">{orders.map((order) => <span key={order.id}>{order.customer_name} {kg(order.quantity_grams)}</span>)}</div>
                  </div>
                  <div className="group-total">
                    {first.status === 'waiting' ? <><small>合并重量</small><strong>{kg(total)}</strong><span>计划 {orders.reduce((sum, order) => sum + order.batch_count, 0)} 仓</span></> : progress ? <><small>已记录烘焙</small><strong>{kg(progress.chargedGrams)}</strong><span>{progress.machine} · {extra ? `成品余量 ${kg(extra)}` : remaining ? `还差 ${kg(remaining)}` : '刚好完成订单重量'}</span></> : <><small>订单目标</small><strong>{kg(total)}</strong><span>等待录入本锅克重</span></>}
                  </div>
                  {first.status === 'waiting' ? <Button className="primary-action" disabled={busy || !!currentRoasting} onClick={() => startBatch(orders)}><Flame />{currentRoasting ? '等待当前烘焙' : '开始这一批'}</Button> : <button className="roasting-state" onClick={() => resumeBatch(orders)}><Flame />{progress?.machine || 'Sandouke 600'} · 烘焙中<ArrowRight /></button>}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="customer-order-list">
            {data.active_orders.filter((order) => order.status === 'waiting' || currentRoasting?.some((active) => active.id === order.id)).map((order) => (
              <article key={order.id}>
                <div><strong>{order.customer_name}</strong><span>{order.code}</span></div>
                <div><strong>{order.bean_name}</strong><span>{skuName(catalog.skus.find((item) => item.id === order.sku_id), order)}</span></div>
                <strong>{kg(order.quantity_grams)}</strong>
                {order.status === 'waiting' ? <Button variant="outline" disabled={busy || !!currentRoasting} onClick={() => startBatch([order])}>{currentRoasting ? '等待当前烘焙' : '开始烘焙'}<ArrowRight /></Button> : <button className="roasting-state" onClick={() => resumeBatch([order])}><Flame />{roastProgress[order.id]?.machine || 'Sandouke 600'} · 烘焙中<ArrowRight /></button>}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function RoastConsole({
  batch,
  busy,
  begin,
  finish,
  saveCorrection,
  saveSession,
  profiles,
}: {
  batch: RoastBatch;
  busy: boolean;
  begin: (chargedGrams: number, machine: string, draft: Omit<RoastSession, 'startedAt' | 'machine' | 'chargedGrams' | 'isRecording'>) => Promise<number | null>;
  finish: (session: RoastSession) => Promise<void>;
  saveCorrection: (session: RoastSession) => Promise<boolean>;
  saveSession: (key: string, session: RoastSession) => void;
  profiles: Profile[];
}) {
  const fallbackProfile = batch.orders[0].profile_snapshot;
  const [profileId, setProfileId] = useState(() => batch.session?.target.profileId || profiles[0]?.id || '');
  const profile = profiles.find((item) => item.id === profileId) || fallbackProfile;
  const [now, setNow] = useState(() => Date.now());
  const [selectedStage, setSelectedStage] = useState('');
  const [chargeSetupOpen, setChargeSetupOpen] = useState(false);
  const [stageRecordOpen, setStageRecordOpen] = useState(false);
  const [chargeTemperature, setChargeTemperature] = useState('');
  const [chargeWeight, setChargeWeight] = useState('');
  const [chargedGrams, setChargedGrams] = useState(() => batch.session?.chargedGrams || 0);
  const [machine, setMachine] = useState(batch.machine);
  const [targetTemperature, setTargetTemperature] = useState(() => batch.session?.target.temperature || String(profile.points.at(-1)?.temperature || ''));
  const [targetExit, setTargetExit] = useState(() => defaultRoastTarget(profile.roast_level));
  const [confirmedTarget, setConfirmedTarget] = useState<ConfirmedTarget | null>(() => batch.session?.target || null);
  const [temperature, setTemperature] = useState('');
  const [typingStartedAt, setTypingStartedAt] = useState<number | null>(null);
  const [stageTemperature, setStageTemperature] = useState('');
  const [stageTypingStartedAt, setStageTypingStartedAt] = useState<number | null>(null);
  const [stageFan, setStageFan] = useState('');
  const [stageTime, setStageTime] = useState('');
  const [editingRecord, setEditingRecord] = useState<number | null>(null);
  const [records, setRecords] = useState<RecordedPoint[]>(() => batch.session?.records || []);
  const startedAt = batch.startedAt;
  const reviewMode = batch.orders.every((order) => order.status === 'completed');

  useEffect(() => {
    if (reviewMode) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [reviewMode]);

  useEffect(() => {
    if (!startedAt || !confirmedTarget) return;
    queueMicrotask(() => {
      saveSession(batch.key, {
        startedAt,
        machine: confirmedTarget.machine,
        chargedGrams,
        records,
        target: confirmedTarget,
        isRecording: true,
      });
    });
  }, [batch.key, chargedGrams, confirmedTarget, records, saveSession, startedAt]);

  const started = startedAt !== null;
  const elapsed = startedAt === null ? 0 : reviewMode ? Math.max(...records.map((point) => point.seconds), 0) : Math.max(0, Math.floor((now - startedAt) / 1000));
  const recordAt = Math.max(
    0,
    startedAt === null ? 0 : Math.floor(((typingStartedAt || now) - startedAt) / 1000),
  );
  const chartData = useMemo(() => {
    const points = new Map<number, { seconds: number; plan?: number; actual?: number; stage?: string }>();
    for (const point of profile.points) {
      points.set(point.seconds, { ...points.get(point.seconds), seconds: point.seconds, plan: point.temperature });
    }
    for (const point of records) {
      points.set(point.seconds, { ...points.get(point.seconds), seconds: point.seconds, actual: point.temperature, stage: point.stage });
    }
    return [...points.values()].sort((a, b) => a.seconds - b.seconds);
  }, [profile.points, records]);
  const chartEnd = Math.max(
    profile.points.at(-1)?.seconds || 0,
    records.at(-1)?.seconds || 0,
    elapsed,
    60,
  );

  function addDigit(digit: string) {
    if (!started) return;
    if (!typingStartedAt) setTypingStartedAt(now);
    setTemperature((value) => appendDecimal(value, digit, 350));
  }

  function erase() {
    setTemperature((value) => {
      const next = value.slice(0, -1);
      if (!next) setTypingStartedAt(null);
      return next;
    });
  }

  function recordTemperature() {
    if (!started) return;
    const value = Number(temperature);
    if (!isOneDecimal(temperature, 0, 350)) return;
    setRecords((current) => [
      ...current,
      { stage: selectedStage || '即时温度', seconds: recordAt, temperature: value },
    ]);
    setTemperature('');
    setTypingStartedAt(null);
  }

  function openStageRecord(stage: string, index: number | null = null) {
    setSelectedStage(stage);
    if (!started || stage === '准备入豆') return;
    const existing = index === null ? null : records[index];
    setStageTemperature(existing ? decimal(existing.temperature) : '');
    setStageTypingStartedAt(null);
    setStageFan(existing?.fan === undefined ? '' : decimal(existing.fan));
    setStageTime(existing ? formatSeconds(existing.seconds) : '');
    setEditingRecord(index);
    setStageRecordOpen(true);
  }

  function recordStage() {
    const value = Number(stageTemperature);
    const fan = Number(stageFan);
    if (!isOneDecimal(stageTemperature, 0, 350) || !isOneDecimal(stageFan, 0, 10)) return;
    const manuallySetSeconds = stageTime.trim() ? parseSeconds(stageTime) : null;
    if (stageTime.trim() && manuallySetSeconds === null) return;
    const seconds = manuallySetSeconds ?? Math.max(
      0,
      startedAt === null
        ? 0
        : Math.floor(((stageTypingStartedAt || now) - startedAt) / 1000),
    );
    const nextPoint = { stage: selectedStage, seconds, temperature: value, fan };
    setRecords((current) => editingRecord === null
      ? [...current, nextPoint]
      : current.map((point, index) => index === editingRecord ? nextPoint : point));
    setStageRecordOpen(false);
  }

  async function beginRecording() {
    const inputTemperature = Number(chargeTemperature);
    const inputWeight = Number(chargeWeight);
    if (!Number.isFinite(inputTemperature) || inputTemperature < 0 || inputTemperature > 350) return;
    if (!Number.isFinite(inputWeight) || inputWeight <= 0 || inputWeight > 100000) return;
    const target = roastTargets.find((item) => item.value === targetExit) || roastTargets[1];
    const confirmed = { temperature: targetTemperature, label: target.label, level: target.level, machine, profileId, profileName: profile.name };
    const initialRecords = [{ stage: '入豆', seconds: 0, temperature: inputTemperature }];
    const startedAt = await begin(inputWeight, machine, { records: initialRecords, target: confirmed });
    if (!startedAt) return;
    setNow(startedAt);
    setChargedGrams(inputWeight);
    setRecords(initialRecords);
    setSelectedStage('回温');
    setConfirmedTarget(confirmed);
    setChargeSetupOpen(false);
  }

  function sessionForSave(): RoastSession | null {
    if (!startedAt || !confirmedTarget) return null;
    return {
      startedAt,
      machine: confirmedTarget.machine,
      chargedGrams,
      target: confirmedTarget,
      records,
      isRecording: true,
    };
  }

  const stages = ['准备入豆', '回温', '转黄 / 开风门', '一爆', '二爆', '出豆'];
  return (
    <div className="roast-console">
      <DialogHeader>
        <div className="roast-console-title">
          <div>
            <p>{reviewMode ? 'ROAST CURVE REVIEW' : 'LIVE ROAST CONSOLE'}</p>
            <DialogTitle>{batch.orders[0].bean_name} · {reviewMode ? '烘焙曲线复核' : '本锅烘焙'}</DialogTitle>
            <DialogDescription>
              {confirmedTarget?.profileName || profile.name} · {batch.orders.length} 张订单合并烘焙
            </DialogDescription>
            {confirmedTarget && <span className="confirmed-target">{confirmedTarget.machine} · 目标 {confirmedTarget.temperature} ℃ · {confirmedTarget.label} · {confirmedTarget.level}</span>}
          </div>
          <div className="roast-head-actions">
            {!reviewMode && started && <Button className="finish-roast-quick" disabled={busy} onClick={() => { const session = sessionForSave(); if (session) void finish(session); }}><CheckCheck />完成烘焙</Button>}
            <div className="roast-clock"><TimerReset size={17} /><strong>{started ? formatSeconds(elapsed) : '待开始'}</strong><span>{reviewMode ? '已记录时长' : started ? '本锅时间' : '填写入豆资料后开始'}</span></div>
          </div>
        </div>
      </DialogHeader>

      <section className="live-curve" aria-label="计划与实际豆温曲线">
        <div className="live-curve-heading">
          <div><span className="curve-legend plan" />历史 / 方案曲线</div>
          <div><span className="curve-legend actual" />本次实际曲线</div>
        </div>
        <ChartContainer config={{ plan: { label: '方案豆温', color: '#82979b' }, actual: { label: '本次豆温', color: '#d2763c' } }} className="live-curve-chart">
          <LineChart data={chartData} margin={{ top: 16, right: 18, bottom: 4, left: 4 }}>
            <CartesianGrid vertical={false} stroke="#e2e8e8" />
            <XAxis dataKey="seconds" type="number" domain={[0, chartEnd]} tickFormatter={formatSeconds} tickLine={false} axisLine={false} minTickGap={32} />
            <YAxis domain={[0, 230]} tickFormatter={(value) => value + '°'} tickLine={false} axisLine={false} width={46} />
            <Tooltip labelFormatter={(value) => formatSeconds(Number(value))} formatter={(value, name) => [String(value) + ' ℃', name === 'plan' ? '方案豆温' : '本次豆温']} />
            <Line type="linear" dataKey="plan" name="plan" stroke="#82979b" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} connectNulls />
            <Line type="linear" dataKey="actual" name="actual" stroke="#d2763c" strokeWidth={3} dot={{ r: 4, fill: '#fff', stroke: '#d2763c', strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} connectNulls />
          </LineChart>
        </ChartContainer>
        <p>{records.length ? `已记录 ${records.length} 个实际温度点，最近一点：${formatSeconds(records.at(-1)?.seconds || 0)} · ${decimal(records.at(-1)?.temperature || 0)} ℃${records.at(-1)?.fan !== undefined ? ` · 风门 ${decimal(records.at(-1)?.fan || 0)}/10` : ''}` : '准备入豆后，填写温度与克重；开始录豆后会从 0:00 记录实际曲线。'}</p>
      </section>

      {reviewMode && <section className="curve-record-list" aria-label="已记录的烘焙节点">
        <div><h2>实际烘焙节点</h2><p>点击任一节点可以修正温度、风门或时间，保存后曲线会立即按新参数重画。</p></div>
        {records.length ? <div className="curve-record-grid">{records.map((point, index) => <button key={index + point.stage} onClick={() => openStageRecord(point.stage, index)}><span>{point.stage}</span><strong>{formatSeconds(point.seconds)}</strong><small>{decimal(point.temperature)} ℃{point.fan !== undefined ? ` · 风门 ${decimal(point.fan)}/10` : ''}</small><em>修正</em></button>)}</div> : <p className="curve-record-empty">这张旧订单暂未保存实际曲线；可从阶段按钮补录节点，再保存修正。</p>}
      </section>}

      <section className="roast-controls">
        <div className="stage-pad" aria-label="烘焙阶段">
          <span className="control-label">烘焙阶段</span>
          <div>
            {stages.map((stage, index) => (
              <button key={stage} className={selectedStage === stage ? 'active' : ''} onClick={() => {
                if (stage === '准备入豆' && !started) {
                  setSelectedStage(stage);
                  setChargeSetupOpen(true);
                  return;
                }
                openStageRecord(stage);
              }}>
                <small>{String(index + 1).padStart(2, '0')}</small>{stage}
              </button>
            ))}
          </div>
        </div>
        <div className="temperature-pad">
          <div className="temperature-screen">
            <span><Thermometer size={17} />正在记录：{selectedStage || '选择一个阶段或直接记录温度'}</span>
            <strong>{temperature || '—'}<small>℃</small></strong>
            <p>{started ? `记录时间 ${formatSeconds(recordAt)}（从输入第一个数字起算）` : '请先点击“准备入豆”，填写资料并开始录豆。'}</p>
          </div>
          <div className="number-pad" aria-label="输入豆温">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'].map((digit) => <button key={digit} disabled={!started} onClick={() => addDigit(digit)}>{digit}</button>)}
            <button className="erase" disabled={!started} aria-label="删除最后一个数字" onClick={erase}><Delete size={20} /></button>
            <button className="record" disabled={!started || !temperature} onClick={recordTemperature}>记录温度</button>
          </div>
        </div>
      </section>
      <div className="roast-console-footer">
        <span>{reviewMode ? '完成后仍可在这里修正实际温度、风门和时间。' : '温度点会按输入第一个数字时的时间写入曲线。未使用的阶段无需填写。'}</span>
        {reviewMode ? <Button className="primary-action" disabled={busy || !started} onClick={() => { const session = sessionForSave(); if (session) void saveCorrection(session); }}><CheckCheck />保存曲线修正</Button> : <Button className="primary-action" disabled={busy || !started} onClick={() => { const session = sessionForSave(); if (session) void finish(session); }}><CheckCheck />完成烘焙，转入待发货</Button>}
      </div>
      <Dialog open={chargeSetupOpen} onOpenChange={setChargeSetupOpen}>
        <DialogContent className="charge-setup-dialog">
          <DialogHeader>
            <DialogTitle>准备入豆</DialogTitle>
            <DialogDescription>确认这锅的起始资料和出豆目标后，点击“开始录豆”才会从 0:00 计时。</DialogDescription>
          </DialogHeader>
          <form className="charge-form" onSubmit={(event) => { event.preventDefault(); void beginRecording(); }}>
            <div className="charge-bean">本锅豆子<strong>{batch.orders[0].bean_name}</strong></div>
            <label htmlFor="roast-profile">本锅烘焙方案<NativeSelect id="roast-profile" value={profileId} onChange={(event) => { const next = event.target.value; setProfileId(next); const selected = profiles.find((item) => item.id === next); if (selected?.points.at(-1)?.temperature) setTargetTemperature(String(selected.points.at(-1)?.temperature)); if (selected) setTargetExit(defaultRoastTarget(selected.roast_level)); }}><option value="">临时方案（不套用已有曲线）</option>{profiles.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.roast_level}</option>)}</NativeSelect></label>
            <label htmlFor="roast-machine">烘焙机<NativeSelect id="roast-machine" value={machine} onChange={(event) => setMachine(event.target.value)}><option value="Sandouke 600">Sandouke 600</option></NativeSelect></label>
            <label htmlFor="charge-temperature">入豆温度（℃）<Input id="charge-temperature" value={chargeTemperature} onChange={(event) => setChargeTemperature(event.target.value)} inputMode="decimal" type="number" min="0" max="350" step="0.1" required placeholder="例如 185.0" /></label>
            <label htmlFor="charge-weight">入豆克重（g）<Input id="charge-weight" value={chargeWeight} onChange={(event) => setChargeWeight(event.target.value)} inputMode="numeric" type="number" min="1" max="100000" required placeholder="例如 1000" /></label>
            <label htmlFor="target-temperature">目标出豆温度（℃）<Input id="target-temperature" value={targetTemperature} onChange={(event) => setTargetTemperature(event.target.value)} inputMode="decimal" type="number" min="0" max="350" step="0.1" required placeholder="例如 190.0" /></label>
            <label htmlFor="target-exit">目标出豆位置<NativeSelect id="target-exit" value={targetExit} onChange={(event) => setTargetExit(event.target.value)}>{roastTargets.map((target) => <option key={target.value} value={target.value}>{target.label} · {target.level}</option>)}</NativeSelect></label>
            <p className="roast-standard">默认参考：一爆初段为浅烘焙；一爆中段为中烘焙；一爆末段为中深烘焙；二爆中段为深烘焙；二爆末段为极深烘焙。</p>
            <Button className="begin-roast" type="submit" disabled={busy || !chargeTemperature || !chargeWeight || !targetTemperature}><Flame />开始录豆</Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={stageRecordOpen} onOpenChange={setStageRecordOpen}>
        <DialogContent className="stage-record-dialog">
          <DialogHeader>
            <DialogTitle>{editingRecord === null ? selectedStage + '记录' : '修正' + selectedStage}</DialogTitle>
            <DialogDescription>豆温与风门均可精确到 0.1；风门范围为 0.0–10.0。时间留空时，会从输入豆温的第一个数字开始计算。</DialogDescription>
          </DialogHeader>
          <form className="stage-record-form" onSubmit={(event) => { event.preventDefault(); recordStage(); }}>
            <div className="stage-touch-grid">
              <section className="stage-keypad" aria-label="触摸输入当前豆温">
                <span>当前豆温（℃）</span>
                <strong>{stageTemperature || '—'}<small>℃</small></strong>
                <div>{['1','2','3','4','5','6','7','8','9','.','0'].map((digit) => <button type="button" key={digit} onClick={() => { if (!stageTypingStartedAt) setStageTypingStartedAt(now); setStageTemperature((value) => appendDecimal(value, digit, 350)); }}>{digit}</button>)}<button className="erase" type="button" onClick={() => setStageTemperature((value) => { const next = value.slice(0, -1); if (!next) setStageTypingStartedAt(null); return next; })}><Delete size={20} /></button></div>
              </section>
              <div className="stage-fan-stack">
                <section className="stage-fan-keypad" aria-label="触摸输入风门">
                  <span>风门（0.0–10.0）</span>
                  <strong>{stageFan || '—'}<small>/10</small></strong>
                  <div>{['1','2','3','4','5','6','7','8','9','.','0'].map((digit) => <button type="button" key={digit} onClick={() => setStageFan((value) => appendDecimal(value, digit, 10))}>{digit}</button>)}<button className="erase" type="button" onClick={() => setStageFan((value) => value.slice(0, -1))}><Delete size={20} /></button></div>
                </section>
                <label className="stage-time-input" htmlFor="stage-record-time">修正时间（可选）<Input id="stage-record-time" value={stageTime} onChange={(event) => setStageTime(event.target.value)} inputMode="text" placeholder={`例如 ${formatSeconds(Math.max(0, startedAt === null ? 0 : Math.floor(((stageTypingStartedAt || now) - startedAt) / 1000)))}`} /><small>格式为 分:秒，例如 7:30。填写后曲线会按这个时间重新定位。</small></label>
              </div>
            </div>
            <Button className="stage-save" type="submit" disabled={!isOneDecimal(stageTemperature, 0, 350) || !isOneDecimal(stageFan, 0, 10)}><Thermometer />{editingRecord === null ? '记录' : '保存修正'} {stageTemperature || '温度'} ℃ · 风门 {stageFan || '—'}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function defaultRoastTarget(roastLevel: string) {
  if (roastLevel.includes('极深')) return 'second-end';
  if (roastLevel.includes('深')) return roastLevel.includes('中深') ? 'first-end' : 'second-middle';
  if (roastLevel.includes('中')) return 'first-middle';
  return 'first-start';
}

function formatSeconds(seconds: number) {
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

function parseSeconds(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (seconds > 59 || minutes * 60 + seconds > 7200) return null;
  return minutes * 60 + seconds;
}

function decimal(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function isOneDecimal(value: string, min: number, max: number) {
  if (!/^\d{1,3}(?:\.\d)?$/.test(value)) return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= min && numeric <= max;
}

function appendDecimal(value: string, key: string, max: number) {
  if (key === '.') return value && !value.includes('.') ? value + '.' : value;
  const candidate = value + key;
  if (!/^\d{1,3}(?:\.\d?)?$/.test(candidate)) return value;
  return Number(candidate) <= max ? candidate : value;
}

function FulfillmentBoard({ data, busy, openShipment, delivered }: { data: OperationsData; busy: boolean; openShipment: (order: RoastOrder | 'sample') => void; delivered: (id: string) => void }) {
  const [view, setView] = useState<'pending' | 'shipped' | 'delivered'>('pending');
  const shippedOrderIds = new Set(data.shipments.map((shipment) => shipment.order_id).filter(Boolean));
  const pending = data.completed_orders.filter((order) => !shippedOrderIds.has(order.id));
  const inTransit = data.shipments.filter((shipment) => shipment.status === 'shipped');
  const deliveredItems = data.shipments.filter((shipment) => shipment.status === 'delivered');
  const shipments = view === 'shipped' ? inTransit : deliveredItems;
  const viewTitle = view === 'shipped' ? '运输途中' : '已经签收';
  return (
    <>
      <div className="operation-stats">
        <button className={'operation-stat urgent ' + (view === 'pending' ? 'active' : '')} onClick={() => setView('pending')}><span><PackageCheck />等待发货</span><strong>{pending.length}</strong><small>张订单</small></button>
        <button className={'operation-stat ' + (view === 'shipped' ? 'active' : '')} onClick={() => setView('shipped')}><span><Truck />运输途中</span><strong>{inTransit.length}</strong><small>个包裹</small></button>
        <button className={'operation-stat ' + (view === 'delivered' ? 'active' : '')} onClick={() => setView('delivered')}><span><CheckCheck />已经签收</span><strong>{deliveredItems.length}</strong><small>个包裹</small></button>
      </div>
      {view === 'pending' ? <section className="panel fulfillment-panel">
        <div className="panel-heading operation-heading"><div><h2>等待发货</h2><p>烘焙完成的订单会自动来到这里。</p></div><Button variant="outline" onClick={() => openShipment('sample')}><Plus />登记样品发货</Button></div>
        {pending.length ? pending.map((order) => (
          <article className="shipment-row" key={order.id}>
            <div className="shipment-customer"><span><Users /></span><div><strong>{order.customer_name}</strong><small>{order.code}</small></div></div>
            <div><strong>{order.bean_name}</strong><small>{kg(order.quantity_grams)} · {order.profile_snapshot.roast_level}</small></div>
            <div><small>计划交付</small><strong>{order.due_date || '未指定'}</strong></div>
            <Button className="primary-action" onClick={() => openShipment(order)}><Send />填写快递单</Button>
          </article>
        )) : <div className="operation-empty compact"><PackageCheck size={36} /><h2>没有等待发货的订单</h2></div>}
      </section> : <section className="panel shipment-history">
        <div className="panel-heading operation-heading"><div><h2>{viewTitle}</h2><p>{view === 'shipped' ? '点击“确认签收”后，包裹会移到已签收。' : '这里保留已经完成签收的发货记录。'}</p></div></div>
        {shipments.length ? shipments.map((shipment) => (
          <article className="shipment-row" key={shipment.id}>
            <div><strong>{shipment.customer_name}</strong><small>{shipment.is_sample ? '样品发货' : shipment.order_code || '订单发货'}</small></div>
            <div><strong>{shipment.carrier}</strong><small>{shipment.tracking_number}</small></div>
            <div><small>发货时间</small><strong>{time(shipment.shipped_at)}</strong></div>
            {shipment.status === 'shipped' ? <Button variant="outline" disabled={busy} onClick={() => delivered(shipment.id)}>确认签收</Button> : <span className="delivered-tag"><CheckCheck />已签收</span>}
          </article>
        )) : <div className="operation-empty compact"><Truck size={36} /><h2>{view === 'shipped' ? '没有运输中的包裹' : '还没有签收记录'}</h2></div>}
      </section>}
    </>
  );
}

function AdminBoard({ data, catalog, openInventory }: { data: OperationsData; catalog: Catalog; openInventory: (sku: BeanSku) => void }) {
  const totalStock = catalog.skus.reduce((sum, sku) => sum + sku.stock_grams, 0);
  const activeWeight = data.active_orders.reduce((sum, order) => sum + order.stock_deducted_grams, 0);
  return (
    <>
      <div className="admin-overview">
        <div className="admin-summary"><span>当前生豆库存</span><strong>{kg(totalStock)}</strong><p>{catalog.skus.length} 个豆子批次分别管理</p></div>
        <div className="admin-summary"><span>进行中订单已扣减</span><strong>{kg(activeWeight)}</strong><p>创建订单时自动从可用批次扣除</p></div>
        <div className="admin-quick"><h2>快速查看</h2><Link href="/"><ClipboardList />全部订单<ArrowRight /></Link><Link href="/customers"><Users />客户档案<ArrowRight /></Link><Link href="/beans"><Boxes />产品与曲线<ArrowRight /></Link></div>
      </div>
      <section className="panel inventory-panel">
        <div className="panel-heading operation-heading"><div><h2>库存与豆子批次</h2><p>年份、处理法、海拔或批次不同，就分别计算库存。</p></div></div>
        <div className="inventory-grid">
          {catalog.skus.map((sku) => {
            const bean = catalog.beans.find((item) => item.id === sku.bean_id);
            const used = data.active_orders.filter((order) => order.sku_id === sku.id).reduce((sum, order) => sum + order.stock_deducted_grams, 0);
            const low = sku.stock_grams < 10000;
            return (
              <article className="inventory-card" key={sku.id}>
                <div className="inventory-card-head"><span className={low ? 'stock-state low' : 'stock-state'}>{low ? '库存偏低' : '库存正常'}</span><Button variant="ghost" size="sm" onClick={() => openInventory(sku)}>调整库存</Button></div>
                <h3>{bean?.name || '豆子'}</h3><p>{sku.label}</p>
                <div className="sku-facts"><span>年份<strong>{sku.harvest_year || '—'}</strong></span><span>处理法<strong>{sku.process || '—'}</strong></span><span>海拔<strong>{sku.altitude_m ? sku.altitude_m + 'm' : '—'}</strong></span><span>批次<strong>{sku.batch_code || '—'}</strong></span></div>
                <div className="stock-total"><span>可用库存<strong>{kg(sku.stock_grams)}</strong></span><small>进行中订单已扣 {kg(used)}</small></div>
              </article>
            );
          })}
        </div>
      </section>
      <section className="panel stock-history">
        <div className="panel-heading operation-heading"><div><h2>最近库存记录</h2><p>每次入库、调整和订单扣减都有记录。</p></div></div>
        {data.movements.length ? data.movements.slice(0, 12).map((movement) => (
          <article key={movement.id}><span className={movement.delta_grams >= 0 ? 'movement-plus' : 'movement-minus'}>{movement.delta_grams >= 0 ? '+' : ''}{kg(movement.delta_grams)}</span><div><strong>{movement.bean_name} · {movement.sku_label}</strong><small>{movement.notes || '库存调整'}</small></div><time>{time(movement.occurred_at)}</time></article>
        )) : <div className="operation-empty compact"><History size={34} /><h2>还没有库存变动记录</h2></div>}
      </section>
    </>
  );
}

function ShipmentForm({ order, busy, submit }: { order: RoastOrder | 'sample'; busy: boolean; submit: (payload: Record<string, unknown>) => void }) {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [scanStream, setScanStream] = useState<MediaStream | null>(null);
  const [scanNote, setScanNote] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
  type DetectorConstructor = new (options?: { formats?: string[] }) => Detector;
  function stopScanner() {
    setScanStream(null);
  }
  async function startScanner() {
    setScanNote('');
    const DetectorClass = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
    if (!DetectorClass) {
      setScanNote('这台设备不支持相机识别；可以直接用扫码枪扫进单号输入框。');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      setScanStream(stream);
      setScanNote('请将快递单条码放入取景框。识别后会自动填入单号。');
    } catch {
      setScanNote('无法打开相机。请允许相机权限，或直接扫码枪录入单号。');
    }
  }
  useEffect(() => {
    if (!scanStream || !videoRef.current) return;
    const video = videoRef.current;
    const DetectorClass = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
    if (!DetectorClass) return;
    const detector = new DetectorClass({ formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'itf', 'upc_a', 'upc_e'] });
    let cancelled = false;
    let frame = 0;
    video.srcObject = scanStream;
    const scan = async () => {
      if (cancelled) return;
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const result = await detector.detect(video).catch(() => []);
        const code = result[0]?.rawValue?.trim();
        if (code) {
          setTrackingNumber(code);
          setScanNote('已识别快递单号：' + code);
          setScanStream(null);
          return;
        }
      }
      frame = window.requestAnimationFrame(() => void scan());
    };
    void video.play().then(() => void scan()).catch(() => setScanNote('相机预览未能启动，请检查相机权限。'));
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      scanStream.getTracks().forEach((track) => track.stop());
    };
  }, [scanStream]);
  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    submit({ ...values, kind: 'shipment', order_id: order === 'sample' ? '' : order.id, customer_name: order === 'sample' ? values.customer_name : order.customer_name, is_sample: order === 'sample' ? 1 : 0 });
  }
  return <form onSubmit={handleSubmit}><fieldset disabled={busy} className="form-grid">
    <label className="field field-wide" htmlFor="shipment-customer"><span>客户</span><Input id="shipment-customer" name="customer_name" required={order === 'sample'} readOnly={order !== 'sample'} defaultValue={order === 'sample' ? '' : order.customer_name} placeholder="样品收件人或单位" /></label>
    <label className="field" htmlFor="shipment-carrier"><span>快递公司 *</span><NativeSelect id="shipment-carrier" name="carrier" required defaultValue="顺丰"><option>顺丰</option><option>京东物流</option><option>中通</option><option>自提</option><option>其他</option></NativeSelect></label>
    <div className="field shipment-tracking-field"><span>快递单号 *</span><div className="shipment-tracking-input"><Input id="shipment-tracking" name="tracking_number" required value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} placeholder="扫描或填写单号" /><Button type="button" variant="outline" onClick={() => void startScanner()}><ScanLine />扫描录入</Button></div></div>
    {(scanNote || scanStream) && <div className="shipment-scanner field-wide">{scanStream && <video ref={videoRef} className="scanner-preview" muted playsInline />}{scanNote && <small>{scanNote}</small>}{scanStream && <Button type="button" variant="outline" size="sm" onClick={stopScanner}>停止扫描</Button>}</div>}
    <label className="field field-wide" htmlFor="shipment-notes"><span>发货备注</span><Textarea id="shipment-notes" name="notes" maxLength={500} placeholder="包装、样品内容或其他提醒…" /></label>
    <div className="form-actions field-wide"><span>物流轨迹暂时手动确认</span><Button className="primary-action" type="submit"><Send />{busy ? '正在保存…' : '确认发货'}</Button></div>
  </fieldset></form>;
}

function InventoryForm({ sku, busy, submit }: { sku: BeanSku; busy: boolean; submit: (payload: Record<string, unknown>) => void }) {
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const grams = Math.round(Number(values.quantity_g)) * (direction === 'in' ? 1 : -1);
    submit({ kind: 'inventory', sku_id: sku.id, delta_grams: grams, notes: values.notes });
  }
  return <form onSubmit={handleSubmit}><fieldset disabled={busy} className="form-grid">
    <label className="field" htmlFor="inventory-action"><span>操作 *</span><NativeSelect id="inventory-action" value={direction} onChange={(event) => setDirection(event.target.value as 'in' | 'out')}><option value="in">入库</option><option value="out">调减 / 盘亏</option></NativeSelect></label>
    <label className="field" htmlFor="inventory-weight"><span>重量（g）*</span><Input id="inventory-weight" name="quantity_g" type="number" min="1" step="1" required /></label>
    <label className="field field-wide" htmlFor="inventory-notes"><span>备注</span><Textarea id="inventory-notes" name="notes" maxLength={500} placeholder="例如：9月到货、盘点修正…" /></label>
    <div className="form-actions field-wide"><span>调整后库存不能小于 0</span><Button className="primary-action" type="submit"><Warehouse />{busy ? '正在保存…' : '保存库存'}</Button></div>
  </fieldset></form>;
}
