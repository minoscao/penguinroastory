'use client';

import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
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
  RoastOrder,
  Shipment,
  StockMovement,
} from '@/lib/model';

type RoastBatch = {
  key: string;
  orders: RoastOrder[];
  startedAt: number | null;
};

type RecordedPoint = {
  stage: string;
  seconds: number;
  temperature: number;
  fan?: number;
};

type RoastProgress = {
  chargedGrams: number;
  targetGrams: number;
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
  return (grams / 1000).toLocaleString('zh-CN', { maximumFractionDigits: 3 }) + ' kg';
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
  return sku?.label || order?.sku_snapshot?.label || '旧订单 · 规格待补充';
}

export default function OperationsPanel({
  view,
  catalog,
  source,
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
  const [shipmentOrder, setShipmentOrder] = useState<RoastOrder | 'sample' | null>(null);
  const [inventorySku, setInventorySku] = useState<BeanSku | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setError('');
    });
    callApi<OperationsData>(
      '/api/roastery?' + new URLSearchParams({ kind: 'operations', source }),
      { signal: controller.signal },
    )
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '读取失败');
      });
    return () => controller.abort();
  }, [source, revision, reload]);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const stored = window.localStorage.getItem('penguin-roast-progress');
        if (stored) setRoastProgress(JSON.parse(stored) as Record<string, RoastProgress>);
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

  async function startBatch(orders: RoastOrder[]) {
    setRoastBatch({
      key: orders.map((order) => order.id).join('-'),
      orders,
      startedAt: null,
    });
  }

  async function beginBatch(chargedGrams: number) {
    if (!roastBatch) return null;
    const startedAt = Date.now();
    const ok = await mutate(
      { kind: 'batch-status', id: roastBatch.orders[0].id, ids: roastBatch.orders.map((order) => order.id), status: 'roasting' },
      `已开始 ${roastBatch.orders.length} 张合并订单`,
    );
    if (!ok) return null;
    const progress = {
      chargedGrams,
      targetGrams: roastBatch.orders.reduce((sum, order) => sum + order.quantity_grams, 0),
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
    setRoastBatch((current) => current ? { ...current, startedAt } : current);
    return startedAt;
  }

  async function finishBatch() {
    if (!roastBatch) return;
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
  roastProgress,
}: {
  data: OperationsData;
  catalog: Catalog;
  mode: 'bean' | 'customer';
  setMode: (mode: 'bean' | 'customer') => void;
  busy: boolean;
  startBatch: (orders: RoastOrder[]) => Promise<void>;
  roastProgress: Record<string, RoastProgress>;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, RoastOrder[]>();
    for (const order of data.active_orders) {
      const key = [order.status, order.sku_id || order.bean_id, order.profile_id].join('|');
      map.set(key, [...(map.get(key) || []), order]);
    }
    return [...map.values()];
  }, [data.active_orders]);
  const waiting = data.active_orders.filter((order) => order.status === 'waiting').length;
  const roasting = data.active_orders.filter((order) => order.status === 'roasting').length;
  return (
    <>
      <div className="operation-stats">
        <div className="operation-stat"><span><Boxes />等待安排</span><strong>{waiting}</strong><small>张订单</small></div>
        <div className="operation-stat accent"><span><Flame />正在烘焙</span><strong>{roasting}</strong><small>张订单</small></div>
        <div className="operation-stat"><span><Scale />今日待处理</span><strong>{kg(data.active_orders.reduce((sum, order) => sum + order.quantity_grams, 0))}</strong><small>订单总重量</small></div>
      </div>
      <section className="panel">
        <div className="panel-heading operation-heading">
          <div><h2>烘焙安排</h2><p>相同豆子规格与相同曲线会自动放在一起。</p></div>
          <div className="view-switch" aria-label="查看方式">
            <button className={mode === 'bean' ? 'active' : ''} onClick={() => setMode('bean')}>按豆子合并</button>
            <button className={mode === 'customer' ? 'active' : ''} onClick={() => setMode('customer')}>按客户查看</button>
          </div>
        </div>
        {data.active_orders.length === 0 ? (
          <div className="operation-empty"><CheckCheck size={40} /><h2>今天的烘焙已经安排完了</h2><p>新订单会自动出现在这里。</p></div>
        ) : mode === 'bean' ? (
          <div className="roast-groups">
            {groups.map((orders) => {
              const first = orders[0];
              const sku = catalog.skus.find((item) => item.id === first.sku_id);
              const total = orders.reduce((sum, order) => sum + order.quantity_grams, 0);
              const batchKey = orders.map((order) => order.id).join('-');
              const progress = roastProgress[batchKey];
              const remaining = Math.max(0, total - (progress?.chargedGrams || 0));
              const extra = Math.max(0, (progress?.chargedGrams || 0) - total);
              return (
                <article className="roast-group" key={[first.status, first.sku_id, first.profile_id].join('-')}>
                  <div className={'group-icon ' + first.status}>{first.status === 'waiting' ? <Boxes /> : <Flame />}</div>
                  <div className="group-main">
                    <div className="group-title"><strong>{first.bean_name}</strong><span>{skuName(sku, first)}</span></div>
                    <p>{first.profile_snapshot.name} · {first.profile_snapshot.roast_level} · {orders.length} 位客户</p>
                    <div className="customer-chips">{orders.map((order) => <span key={order.id}>{order.customer_name} {kg(order.quantity_grams)}</span>)}</div>
                  </div>
                  <div className="group-total">
                    {first.status === 'waiting' ? <><small>合并重量</small><strong>{kg(total)}</strong><span>计划 {orders.reduce((sum, order) => sum + order.batch_count, 0)} 仓</span></> : progress ? <><small>已记录烘焙</small><strong>{kg(progress.chargedGrams)}</strong><span>{extra ? `成品余量 ${kg(extra)}` : remaining ? `还差 ${kg(remaining)}` : '刚好完成订单重量'}</span></> : <><small>订单目标</small><strong>{kg(total)}</strong><span>等待录入本锅克重</span></>}
                  </div>
                  {first.status === 'waiting' ? <Button className="primary-action" disabled={busy} onClick={() => startBatch(orders)}><Flame />开始这一批</Button> : <span className="roasting-state"><Flame />烘焙中</span>}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="customer-order-list">
            {data.active_orders.map((order) => (
              <article key={order.id}>
                <div><strong>{order.customer_name}</strong><span>{order.code}</span></div>
                <div><strong>{order.bean_name}</strong><span>{skuName(catalog.skus.find((item) => item.id === order.sku_id), order)}</span></div>
                <strong>{kg(order.quantity_grams)}</strong>
                {order.status === 'waiting' ? <Button variant="outline" disabled={busy} onClick={() => startBatch([order])}>开始烘焙<ArrowRight /></Button> : <span className="roasting-state"><Flame />烘焙中</span>}
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
}: {
  batch: RoastBatch;
  busy: boolean;
  begin: (chargedGrams: number) => Promise<number | null>;
  finish: () => Promise<void>;
}) {
  const profile = batch.orders[0].profile_snapshot;
  const [now, setNow] = useState(() => Date.now());
  const [selectedStage, setSelectedStage] = useState('');
  const [chargeSetupOpen, setChargeSetupOpen] = useState(false);
  const [stageRecordOpen, setStageRecordOpen] = useState(false);
  const [chargeTemperature, setChargeTemperature] = useState('');
  const [chargeWeight, setChargeWeight] = useState('');
  const [targetTemperature, setTargetTemperature] = useState(() => String(profile.points.at(-1)?.temperature || ''));
  const [targetExit, setTargetExit] = useState(() => defaultRoastTarget(profile.roast_level));
  const [confirmedTarget, setConfirmedTarget] = useState<{ temperature: string; label: string; level: string } | null>(null);
  const [temperature, setTemperature] = useState('');
  const [typingStartedAt, setTypingStartedAt] = useState<number | null>(null);
  const [stageTemperature, setStageTemperature] = useState('');
  const [stageTypingStartedAt, setStageTypingStartedAt] = useState<number | null>(null);
  const [stageFan, setStageFan] = useState<number | null>(null);
  const [records, setRecords] = useState<RecordedPoint[]>([]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  const startedAt = batch.startedAt;
  const started = startedAt !== null;
  const elapsed = startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
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
    setTemperature((value) => (value.length >= 3 ? value : value + digit));
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
    if (!Number.isFinite(value) || value < 0 || value > 350) return;
    setRecords((current) => [
      ...current,
      { stage: selectedStage || '即时温度', seconds: recordAt, temperature: value },
    ]);
    setTemperature('');
    setTypingStartedAt(null);
  }

  function openStageRecord(stage: string) {
    setSelectedStage(stage);
    if (!started || stage === '准备入豆') return;
    setStageTemperature('');
    setStageTypingStartedAt(null);
    setStageFan(null);
    setStageRecordOpen(true);
  }

  function recordStage() {
    const value = Number(stageTemperature);
    if (!Number.isFinite(value) || value < 0 || value > 350 || !stageFan) return;
    const seconds = Math.max(
      0,
      startedAt === null
        ? 0
        : Math.floor(((stageTypingStartedAt || now) - startedAt) / 1000),
    );
    setRecords((current) => [
      ...current,
      { stage: selectedStage, seconds, temperature: value, fan: stageFan },
    ]);
    setStageRecordOpen(false);
  }

  async function beginRecording() {
    const inputTemperature = Number(chargeTemperature);
    const inputWeight = Number(chargeWeight);
    if (!Number.isFinite(inputTemperature) || inputTemperature < 0 || inputTemperature > 350) return;
    if (!Number.isFinite(inputWeight) || inputWeight <= 0 || inputWeight > 100000) return;
    const startedAt = await begin(inputWeight);
    if (!startedAt) return;
    setNow(startedAt);
    setRecords([{ stage: '入豆', seconds: 0, temperature: inputTemperature }]);
    setSelectedStage('回温');
    const target = roastTargets.find((item) => item.value === targetExit) || roastTargets[1];
    setConfirmedTarget({ temperature: targetTemperature, label: target.label, level: target.level });
    setChargeSetupOpen(false);
  }

  const stages = ['准备入豆', '回温', '转黄 / 开风门', '一爆', '二爆', '出豆'];
  return (
    <div className="roast-console">
      <DialogHeader>
        <div className="roast-console-title">
          <div>
            <p>LIVE ROAST CONSOLE</p>
            <DialogTitle>{batch.orders[0].bean_name} · 本锅烘焙</DialogTitle>
            <DialogDescription>
              {profile.name} · {batch.orders.length} 张订单合并烘焙
            </DialogDescription>
            {confirmedTarget && <span className="confirmed-target">目标 {confirmedTarget.temperature} ℃ · {confirmedTarget.label} · {confirmedTarget.level}</span>}
          </div>
          <div className="roast-clock"><TimerReset size={17} /><strong>{started ? formatSeconds(elapsed) : '待开始'}</strong><span>{started ? '本锅时间' : '填写入豆资料后开始'}</span></div>
        </div>
      </DialogHeader>

      <section className="live-curve" aria-label="计划与实际豆温曲线">
        <div className="live-curve-heading">
          <div><span className="curve-legend plan" />历史 / 方案曲线</div>
          <div><span className="curve-legend actual" />本次实际曲线</div>
        </div>
        <ChartContainer config={{ plan: { label: '方案豆温', color: '#82979b' }, actual: { label: '本次豆温', color: '#d2763c' } }} className="live-curve-chart">
          <LineChart data={chartData} margin={{ top: 16, right: 18, bottom: 4, left: -16 }}>
            <CartesianGrid vertical={false} stroke="#e2e8e8" />
            <XAxis dataKey="seconds" type="number" domain={[0, chartEnd]} tickFormatter={formatSeconds} tickLine={false} axisLine={false} minTickGap={32} />
            <YAxis domain={[0, 230]} tickFormatter={(value) => value + '°'} tickLine={false} axisLine={false} width={38} />
            <Tooltip labelFormatter={(value) => formatSeconds(Number(value))} formatter={(value, name) => [String(value) + ' ℃', name === 'plan' ? '方案豆温' : '本次豆温']} />
            <Line type="linear" dataKey="plan" name="plan" stroke="#82979b" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} connectNulls />
            <Line type="linear" dataKey="actual" name="actual" stroke="#d2763c" strokeWidth={3} dot={{ r: 4, fill: '#fff', stroke: '#d2763c', strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} connectNulls />
          </LineChart>
        </ChartContainer>
        <p>{records.length ? `已记录 ${records.length} 个实际温度点，最近一点：${formatSeconds(records.at(-1)?.seconds || 0)} · ${records.at(-1)?.temperature} ℃${records.at(-1)?.fan ? ` · 风门 ${records.at(-1)?.fan}/10` : ''}` : '准备入豆后，填写温度与克重；开始录豆后会从 0:00 记录实际曲线。'}</p>
      </section>

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
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((digit) => <button key={digit} disabled={!started} onClick={() => addDigit(digit)}>{digit}</button>)}
            <button className="erase" disabled={!started} aria-label="删除最后一个数字" onClick={erase}><Delete size={20} /></button>
            <button className="record" disabled={!started || !temperature} onClick={recordTemperature}>记录温度</button>
          </div>
        </div>
      </section>
      <div className="roast-console-footer">
        <span>温度点会按输入第一个数字时的时间写入曲线。</span>
        <Button className="primary-action" disabled={busy || !started} onClick={finish}><CheckCheck />结束本锅并标记完成</Button>
      </div>
      <Dialog open={chargeSetupOpen} onOpenChange={setChargeSetupOpen}>
        <DialogContent className="charge-setup-dialog">
          <DialogHeader>
            <DialogTitle>准备入豆</DialogTitle>
            <DialogDescription>确认这锅的起始资料和出豆目标后，点击“开始录豆”才会从 0:00 计时。</DialogDescription>
          </DialogHeader>
          <form className="charge-form" onSubmit={(event) => { event.preventDefault(); void beginRecording(); }}>
            <div className="charge-bean">本锅豆子<strong>{batch.orders[0].bean_name}</strong></div>
            <label htmlFor="charge-temperature">入豆温度（℃）<Input id="charge-temperature" value={chargeTemperature} onChange={(event) => setChargeTemperature(event.target.value)} inputMode="numeric" type="number" min="0" max="350" required placeholder="例如 185" /></label>
            <label htmlFor="charge-weight">入豆克重（g）<Input id="charge-weight" value={chargeWeight} onChange={(event) => setChargeWeight(event.target.value)} inputMode="numeric" type="number" min="1" max="100000" required placeholder="例如 1000" /></label>
            <label htmlFor="target-temperature">目标出豆温度（℃）<Input id="target-temperature" value={targetTemperature} onChange={(event) => setTargetTemperature(event.target.value)} inputMode="numeric" type="number" min="0" max="350" required placeholder="例如 190" /></label>
            <label htmlFor="target-exit">目标出豆位置<NativeSelect id="target-exit" value={targetExit} onChange={(event) => setTargetExit(event.target.value)}>{roastTargets.map((target) => <option key={target.value} value={target.value}>{target.label} · {target.level}</option>)}</NativeSelect></label>
            <p className="roast-standard">默认参考：一爆初段为浅烘焙；一爆中段为中烘焙；一爆末段为中深烘焙；二爆中段为深烘焙；二爆末段为极深烘焙。</p>
            <Button className="begin-roast" type="submit" disabled={busy || !chargeTemperature || !chargeWeight || !targetTemperature}><Flame />开始录豆</Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={stageRecordOpen} onOpenChange={setStageRecordOpen}>
        <DialogContent className="stage-record-dialog">
          <DialogHeader>
            <DialogTitle>{selectedStage}记录</DialogTitle>
            <DialogDescription>填写此刻豆温，并直接点选风门档位。记录时间从输入温度的第一个数字开始计算。</DialogDescription>
          </DialogHeader>
          <form className="stage-record-form" onSubmit={(event) => { event.preventDefault(); recordStage(); }}>
            <label htmlFor="stage-temperature">当前豆温（℃）<Input id="stage-temperature" value={stageTemperature} onChange={(event) => { if (!stageTypingStartedAt && event.target.value) setStageTypingStartedAt(now); setStageTemperature(event.target.value); }} inputMode="numeric" type="number" min="0" max="350" required placeholder="例如 185" /></label>
            <fieldset className="fan-picker">
              <legend>风门（1–10）</legend>
              <div>{Array.from({ length: 10 }, (_, index) => index + 1).map((fan) => <button className={stageFan === fan ? 'active' : ''} type="button" key={fan} onClick={() => setStageFan(fan)}>{fan}</button>)}</div>
            </fieldset>
            <Button className="stage-save" type="submit" disabled={!stageTemperature || !stageFan}><Thermometer />记录阶段</Button>
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

function FulfillmentBoard({ data, busy, openShipment, delivered }: { data: OperationsData; busy: boolean; openShipment: (order: RoastOrder | 'sample') => void; delivered: (id: string) => void }) {
  const shippedOrderIds = new Set(data.shipments.map((shipment) => shipment.order_id).filter(Boolean));
  const pending = data.completed_orders.filter((order) => !shippedOrderIds.has(order.id));
  const inTransit = data.shipments.filter((shipment) => shipment.status === 'shipped');
  const deliveredItems = data.shipments.filter((shipment) => shipment.status === 'delivered');
  return (
    <>
      <div className="operation-stats">
        <div className="operation-stat urgent"><span><PackageCheck />等待发货</span><strong>{pending.length}</strong><small>张订单</small></div>
        <div className="operation-stat"><span><Truck />运输途中</span><strong>{inTransit.length}</strong><small>个包裹</small></div>
        <div className="operation-stat"><span><CheckCheck />已经签收</span><strong>{deliveredItems.length}</strong><small>个包裹</small></div>
      </div>
      <section className="panel fulfillment-panel">
        <div className="panel-heading operation-heading"><div><h2>等待发货</h2><p>烘焙完成的订单会自动来到这里。</p></div><Button variant="outline" onClick={() => openShipment('sample')}><Plus />登记样品发货</Button></div>
        {pending.length ? pending.map((order) => (
          <article className="shipment-row" key={order.id}>
            <div className="shipment-customer"><span><Users /></span><div><strong>{order.customer_name}</strong><small>{order.code}</small></div></div>
            <div><strong>{order.bean_name}</strong><small>{kg(order.quantity_grams)} · {order.profile_snapshot.roast_level}</small></div>
            <div><small>计划交付</small><strong>{order.due_date || '未指定'}</strong></div>
            <Button className="primary-action" onClick={() => openShipment(order)}><Send />填写快递单</Button>
          </article>
        )) : <div className="operation-empty compact"><PackageCheck size={36} /><h2>没有等待发货的订单</h2></div>}
      </section>
      <section className="panel shipment-history">
        <div className="panel-heading operation-heading"><div><h2>物流记录</h2><p>第一阶段手动登记；顺丰等物流接口已预留位置。</p></div></div>
        {data.shipments.length ? data.shipments.map((shipment) => (
          <article className="shipment-row" key={shipment.id}>
            <div><strong>{shipment.customer_name}</strong><small>{shipment.is_sample ? '样品发货' : shipment.order_code || '订单发货'}</small></div>
            <div><strong>{shipment.carrier}</strong><small>{shipment.tracking_number}</small></div>
            <div><small>发货时间</small><strong>{time(shipment.shipped_at)}</strong></div>
            {shipment.status === 'shipped' ? <Button variant="outline" disabled={busy} onClick={() => delivered(shipment.id)}>确认签收</Button> : <span className="delivered-tag"><CheckCheck />已签收</span>}
          </article>
        )) : <div className="operation-empty compact"><Truck size={36} /><h2>还没有物流记录</h2></div>}
      </section>
    </>
  );
}

function AdminBoard({ data, catalog, openInventory }: { data: OperationsData; catalog: Catalog; openInventory: (sku: BeanSku) => void }) {
  const totalStock = catalog.skus.reduce((sum, sku) => sum + sku.stock_grams, 0);
  const activeWeight = data.active_orders.reduce((sum, order) => sum + order.stock_deducted_grams, 0);
  return (
    <>
      <div className="admin-overview">
        <div className="admin-summary"><span>当前生豆库存</span><strong>{kg(totalStock)}</strong><p>{catalog.skus.length} 个豆子规格分别管理</p></div>
        <div className="admin-summary"><span>进行中订单已扣减</span><strong>{kg(activeWeight)}</strong><p>创建订单时自动从对应规格扣除</p></div>
        <div className="admin-quick"><h2>快速查看</h2><Link href="/"><ClipboardList />全部订单<ArrowRight /></Link><Link href="/customers"><Users />客户档案<ArrowRight /></Link><Link href="/beans"><Boxes />产品与曲线<ArrowRight /></Link></div>
      </div>
      <section className="panel inventory-panel">
        <div className="panel-heading operation-heading"><div><h2>库存与豆子规格</h2><p>年份、处理法、海拔或批次不同，就分别计算库存。</p></div></div>
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
  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    submit({ ...values, kind: 'shipment', order_id: order === 'sample' ? '' : order.id, customer_name: order === 'sample' ? values.customer_name : order.customer_name, is_sample: order === 'sample' ? 1 : 0 });
  }
  return <form onSubmit={handleSubmit}><fieldset disabled={busy} className="form-grid">
    <label className="field field-wide" htmlFor="shipment-customer"><span>客户</span><Input id="shipment-customer" name="customer_name" required={order === 'sample'} readOnly={order !== 'sample'} defaultValue={order === 'sample' ? '' : order.customer_name} placeholder="样品收件人或单位" /></label>
    <label className="field" htmlFor="shipment-carrier"><span>快递公司 *</span><NativeSelect id="shipment-carrier" name="carrier" required defaultValue="顺丰"><option>顺丰</option><option>京东物流</option><option>中通</option><option>自提</option><option>其他</option></NativeSelect></label>
    <label className="field" htmlFor="shipment-tracking"><span>快递单号 *</span><Input id="shipment-tracking" name="tracking_number" required placeholder="扫描或填写单号" /></label>
    <label className="field field-wide" htmlFor="shipment-notes"><span>发货备注</span><Textarea id="shipment-notes" name="notes" maxLength={500} placeholder="包装、样品内容或其他提醒…" /></label>
    <div className="form-actions field-wide"><span>物流轨迹暂时手动确认</span><Button className="primary-action" type="submit"><Send />{busy ? '正在保存…' : '确认发货'}</Button></div>
  </fieldset></form>;
}

function InventoryForm({ sku, busy, submit }: { sku: BeanSku; busy: boolean; submit: (payload: Record<string, unknown>) => void }) {
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const grams = Math.round(Number(values.quantity_kg) * 1000) * (direction === 'in' ? 1 : -1);
    submit({ kind: 'inventory', sku_id: sku.id, delta_grams: grams, notes: values.notes });
  }
  return <form onSubmit={handleSubmit}><fieldset disabled={busy} className="form-grid">
    <label className="field" htmlFor="inventory-action"><span>操作 *</span><NativeSelect id="inventory-action" value={direction} onChange={(event) => setDirection(event.target.value as 'in' | 'out')}><option value="in">入库</option><option value="out">调减 / 盘亏</option></NativeSelect></label>
    <label className="field" htmlFor="inventory-weight"><span>重量（kg）*</span><Input id="inventory-weight" name="quantity_kg" type="number" min="0.001" step="0.001" required /></label>
    <label className="field field-wide" htmlFor="inventory-notes"><span>备注</span><Textarea id="inventory-notes" name="notes" maxLength={500} placeholder="例如：9月到货、盘点修正…" /></label>
    <div className="form-actions field-wide"><span>调整后库存不能小于 0</span><Button className="primary-action" type="submit"><Warehouse />{busy ? '正在保存…' : '保存库存'}</Button></div>
  </fieldset></form>;
}
