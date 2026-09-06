import { getD1 } from '@/db';
import { seedDemo } from '@/db/seed-demo';
import {
  InputError,
  object,
  text,
  number,
  customerInput,
  beanInput,
  skuInput,
  profileInput,
  orderInput,
  inventoryInput,
  shipmentInput,
  nextStatus,
} from '@/lib/validation';
import type { Profile } from '@/lib/model';
export const dynamic = 'force-dynamic';
const headers = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};
function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers });
}
function decodeProfile(row: Record<string, unknown>) {
  return { ...row, points: JSON.parse(String(row.points)) };
}
function decodeOrder(row: Record<string, unknown>) {
  const { last_transition_id: _transition, ...rest } = row;
  return {
    ...rest,
    sku_id: typeof row.sku_id === 'string' ? row.sku_id : '',
    sku_snapshot:
      typeof row.sku_snapshot === 'string' && row.sku_snapshot
        ? JSON.parse(row.sku_snapshot)
        : null,
    batch_count: Number(row.batch_count || 1),
    stock_deducted_grams: Number(row.stock_deducted_grams || 0),
    profile_snapshot: JSON.parse(String(row.profile_snapshot)),
  };
}
function failure(e: unknown) {
  if (e instanceof InputError) return json({ error: e.message }, e.status);
  console.error(
    'Roastery operation failed',
    e instanceof Error ? e.message : 'unknown',
  );
  return json(
    { error: '暂时没能保存或读取，请稍后重试。你的填写内容会保留。' },
    500,
  );
}
async function body(request: Request) {
  const origin = request.headers.get('origin');
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    throw new InputError('请从本站页面提交操作。', 403);
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new InputError('提交格式不正确。', 415);
  const raw = await request.text();
  if (raw.length > 50000) throw new InputError('提交内容过长。', 413);
  try {
    return object(JSON.parse(raw));
  } catch (e) {
    if (e instanceof InputError) throw e;
    throw new InputError('提交内容格式不正确。');
  }
}
export async function GET(request: Request) {
  try {
    const db = await getD1();
    const p = new URL(request.url).searchParams;
    const kind = p.get('kind') || 'catalog';
    const source = p.get('source') || 'all';
    if (!['all', 'real'].includes(source))
      throw new InputError('记录筛选无效。');
    const realOnly = source === 'real';
    if (kind === 'catalog') {
      const [customers, beans, profiles, skus, stats, demo] = await db.batch<
        Record<string, unknown>
      >([
        db.prepare(
          "SELECT c.*,COUNT(o.id) AS order_count,COALESCE(SUM(CASE WHEN o.status IN ('waiting','roasting') THEN 1 ELSE 0 END),0) AS active_orders,COALESCE(SUM(o.quantity_grams),0) AS total_grams,MAX(o.created_at) AS last_order_at FROM customers c LEFT JOIN orders o ON o.customer_id=c.id" +
            (realOnly ? ' AND o.is_demo=0 WHERE c.is_demo=0' : '') +
            ' GROUP BY c.id ORDER BY c.created_at DESC',
        ),
        db.prepare(
          'SELECT * FROM beans' +
            (realOnly ? ' WHERE is_demo=0' : '') +
            ' ORDER BY created_at DESC',
        ),
        db.prepare(
          'SELECT * FROM profiles' +
            (realOnly ? ' WHERE is_demo=0' : '') +
            ' ORDER BY updated_at DESC',
        ),
        db.prepare(
          'SELECT * FROM bean_skus' +
            (realOnly ? ' WHERE is_demo=0' : '') +
            ' ORDER BY updated_at DESC',
        ),
        db.prepare(
          'SELECT status,COUNT(*) AS count FROM orders' +
            (realOnly ? ' WHERE is_demo=0' : '') +
            ' GROUP BY status',
        ),
        db.prepare(
          'SELECT (SELECT COUNT(*) FROM customers WHERE is_demo=1) AS customers,(SELECT COUNT(*) FROM beans WHERE is_demo=1) AS beans,(SELECT COUNT(*) FROM profiles WHERE is_demo=1) AS profiles,(SELECT COUNT(*) FROM orders WHERE is_demo=1) AS orders',
        ),
      ]);
      return json({
        customers: customers.results,
        beans: beans.results,
        profiles: profiles.results.map(decodeProfile),
        skus: skus.results,
        demo_counts: demo.results[0],
        stats: Object.assign(
          { waiting: 0, roasting: 0, completed: 0 },
          Object.fromEntries(stats.results.map((r) => [r.status, r.count])),
        ),
      });
    }
    if (kind === 'operations') {
      const [active, completed, shipments, movements] = await db.batch<Record<string, unknown>>([
        db.prepare("SELECT * FROM orders WHERE status IN ('waiting','roasting')" + (realOnly ? ' AND is_demo=0' : '') + ' ORDER BY due_date ASC,created_at ASC LIMIT 300'),
        db.prepare("SELECT * FROM orders WHERE status='completed'" + (realOnly ? ' AND is_demo=0' : '') + ' ORDER BY completed_at DESC LIMIT 300'),
        db.prepare('SELECT s.*,o.code AS order_code,o.bean_name,o.quantity_grams FROM shipments s LEFT JOIN orders o ON o.id=s.order_id' + (realOnly ? ' WHERE s.is_sample=1 OR o.is_demo=0' : '') + ' ORDER BY s.shipped_at DESC LIMIT 300'),
        db.prepare('SELECT m.*,s.label AS sku_label,b.name AS bean_name FROM stock_movements m JOIN bean_skus s ON s.id=m.sku_id JOIN beans b ON b.id=s.bean_id' + (realOnly ? ' WHERE s.is_demo=0' : '') + ' ORDER BY m.occurred_at DESC LIMIT 80'),
      ]);
      return json({
        active_orders: active.results.map(decodeOrder),
        completed_orders: completed.results.map(decodeOrder),
        shipments: shipments.results,
        movements: movements.results,
      });
    }
    if (kind === 'detail') {
      const id = text(p.get('id'), '订单', 80, true);
      const order = await db
        .prepare('SELECT * FROM orders WHERE id=?')
        .bind(id)
        .first();
      if (!order) throw new InputError('找不到这张订单。', 404);
      const events = await db
        .prepare(
          'SELECT * FROM order_events WHERE order_id=? ORDER BY occurred_at ASC,id ASC',
        )
        .bind(id)
        .all();
      return json({ order: decodeOrder(order), events: events.results });
    }
    if (kind !== 'orders') throw new InputError('未找到这个功能。', 404);
    const status = p.get('status') || 'all';
    if (!['all', 'waiting', 'roasting', 'completed'].includes(status))
      throw new InputError('订单状态无效。');
    const q = text(p.get('q'), '搜索词', 100);
    const page = number(p.get('page') || 1, '页码', 1, 100000, true);
    const conditions: string[] = [];
    const bindings: (string | number)[] = [];
    if (realOnly) conditions.push('is_demo=0');
    const customerId = text(p.get('customer_id'), '客户', 80);
    if (customerId) {
      conditions.push('customer_id=?');
      bindings.push(customerId);
    }
    if (status !== 'all') {
      conditions.push('status=?');
      bindings.push(status);
    }
    if (q) {
      conditions.push(
        '(instr(lower(code),lower(?))>0 OR instr(lower(customer_name),lower(?))>0 OR instr(lower(bean_name),lower(?))>0)',
      );
      bindings.push(q, q, q);
    }
    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    const sort =
      status === 'completed'
        ? 'completed_at DESC,id DESC'
        : 'created_at DESC,id DESC';
    const [rows, count] = await db.batch<Record<string, unknown>>([
      db
        .prepare(
          'SELECT * FROM orders' +
            where +
            ' ORDER BY ' +
            sort +
            ' LIMIT 20 OFFSET ?',
        )
        .bind(...bindings, (page - 1) * 20),
      db
        .prepare('SELECT COUNT(*) AS count FROM orders' + where)
        .bind(...bindings),
    ]);
    return json({
      orders: rows.results.map(decodeOrder),
      total: count.results[0].count,
      page,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const b = await body(request);
    const db = await getD1();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    if (b.kind === 'demo') return json(await seedDemo(db));
    if (b.kind === 'customer') {
      const x = customerInput(b);
      await db
        .prepare(
          'INSERT INTO customers(id,name,customer_type,contact,phone,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .bind(
          id,
          x.name,
          x.customer_type,
          x.contact,
          x.phone,
          x.notes,
          now,
          now,
        )
        .run();
      return json({ id }, 201);
    }
    if (b.kind === 'bean') {
      const x = beanInput(b);
      await db
        .prepare(
          'INSERT INTO beans(id,name,origin,process,variety,notes,image_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          id,
          x.name,
          x.origin,
          x.process,
          x.variety,
          x.notes,
          x.image_key,
          now,
          now,
        )
        .run();
      return json({ id }, 201);
    }
    if (b.kind === 'sku') {
      const x = skuInput(b);
      const sourceBean = await db.prepare('SELECT is_demo FROM beans WHERE id=?').bind(x.bean_id).first<{ is_demo: number }>();
      if (!sourceBean) throw new InputError('请先保存这款豆子。');
      await db.prepare('INSERT INTO bean_skus(id,bean_id,label,harvest_year,process,altitude_m,batch_code,stock_grams,is_demo,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id, x.bean_id, x.label, x.harvest_year, x.process, x.altitude_m, x.batch_code, x.stock_grams, sourceBean.is_demo || 0, now, now).run();
      if (x.stock_grams > 0)
        await db.prepare("INSERT INTO stock_movements(id,sku_id,movement_type,delta_grams,reference_id,notes,occurred_at) VALUES(?,?,'in',?,'','创建规格时录入',?)").bind('stock-'+id, id, x.stock_grams, now).run();
      return json({ id }, 201);
    }
    if (b.kind === 'profile') {
      const x = profileInput(b);
      const sourceBean = await db
        .prepare('SELECT is_demo FROM beans WHERE id=?')
        .bind(x.bean_id)
        .first<{ is_demo: number }>();
      if (!sourceBean) throw new InputError('请先保存这款豆子。');
      await db
        .prepare(
          'INSERT INTO profiles(id,bean_id,name,roast_level,machine,batch_grams,points,notes,revision,is_demo,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,?,?,?)',
        )
        .bind(
          id,
          x.bean_id,
          x.name,
          x.roast_level,
          x.machine,
          x.batch_grams,
          JSON.stringify(x.points),
          x.notes,
          sourceBean?.is_demo ?? 0,
          now,
          now,
        )
        .run();
      return json({ id }, 201);
    }
    if (b.kind === 'inventory') {
      const x = inventoryInput(b);
      if (x.delta_grams === 0) throw new InputError('库存变动不能为 0。');
      const sku = await db.prepare('SELECT stock_grams FROM bean_skus WHERE id=?').bind(x.sku_id).first<{ stock_grams: number }>();
      if (!sku) throw new InputError('找不到这个豆子规格。', 404);
      if (Number(sku.stock_grams) + x.delta_grams < 0) throw new InputError('调整后的库存不能小于 0。');
      const movementType = x.delta_grams > 0 ? 'in' : 'adjustment';
      await db.batch([
        db.prepare('UPDATE bean_skus SET stock_grams=stock_grams+?,updated_at=? WHERE id=?').bind(x.delta_grams, now, x.sku_id),
        db.prepare('INSERT INTO stock_movements(id,sku_id,movement_type,delta_grams,reference_id,notes,occurred_at) VALUES(?,?,?,?,?,?,?)').bind(id, x.sku_id, movementType, x.delta_grams, '', x.notes, now),
      ]);
      return json({ id }, 201);
    }
    if (b.kind === 'shipment') {
      const x = shipmentInput(b);
      if (x.order_id) {
        const order = await db.prepare("SELECT id FROM orders WHERE id=? AND status='completed'").bind(x.order_id).first();
        if (!order) throw new InputError('这张订单还没有完成烘焙。');
        const existingShipment = await db.prepare('SELECT id FROM shipments WHERE order_id=?').bind(x.order_id).first();
        if (existingShipment) throw new InputError('这张订单已经登记过发货。');
      }
      await db.prepare("INSERT INTO shipments(id,order_id,customer_name,carrier,tracking_number,status,is_sample,notes,shipped_at) VALUES(?,?,?,?,?,'shipped',?,?,?)").bind(id, x.order_id, x.customer_name, x.carrier, x.tracking_number, x.is_sample, x.notes, now).run();
      return json({ id }, 201);
    }
    if (b.kind !== 'order') throw new InputError('未找到这个功能。', 404);
    const x = orderInput(b);
    const existing = await db
      .prepare('SELECT * FROM orders WHERE id=?')
      .bind(x.id)
      .first();
    if (existing) {
      if (
        [
          'customer_id',
          'bean_id',
          'profile_id',
          'sku_id',
          'quantity_grams',
          'batch_count',
          'due_date',
          'notes',
        ].some((key) => existing[key] !== x[key as keyof typeof x])
      ) {
        throw new InputError(
          '这张订单已经保存，但填写内容已变化。请关闭窗口后查看已保存的订单。',
          409,
        );
      }
      return json({ id: existing.id, code: existing.code });
    }
    const [customer, bean, profileRow, sku] = await Promise.all([
      db
        .prepare('SELECT * FROM customers WHERE id=?')
        .bind(x.customer_id)
        .first(),
      db.prepare('SELECT * FROM beans WHERE id=?').bind(x.bean_id).first(),
      db
        .prepare('SELECT * FROM profiles WHERE id=? AND bean_id=?')
        .bind(x.profile_id, x.bean_id)
        .first(),
      db.prepare('SELECT * FROM bean_skus WHERE id=? AND bean_id=?').bind(x.sku_id, x.bean_id).first(),
    ]);
    if (!customer || !bean || !profileRow || !sku)
      throw new InputError('客户、豆子规格或烘焙方案已变化，请重新选择。');
    if (Number(sku.stock_grams) < x.quantity_grams)
      throw new InputError('这个规格的库存不足，请先入库或减少订单重量。');
    const profile = decodeProfile(profileRow) as Profile;
    const isDemo = customer.is_demo || bean.is_demo || profile.is_demo ? 1 : 0;
    const code =
      'PR-' +
      now.slice(0, 10).replaceAll('-', '') +
      '-' +
      x.id.replaceAll('-', '').slice(0, 8).toUpperCase();
    const inserted = await db.batch<Record<string, unknown>>([
      db
        .prepare(
          "INSERT OR IGNORE INTO orders(id,code,customer_id,bean_id,profile_id,customer_name,bean_name,sku_id,sku_snapshot,profile_snapshot,quantity_grams,batch_count,stock_deducted_grams,due_date,notes,status,is_demo,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'waiting',?,?,?)",
        )
        .bind(
          x.id,
          code,
          x.customer_id,
          x.bean_id,
          x.profile_id,
          customer.name,
          bean.name,
          x.sku_id,
          JSON.stringify(sku),
          JSON.stringify(profile),
          x.quantity_grams,
          x.batch_count,
          x.quantity_grams,
          x.due_date,
          x.notes,
          isDemo,
          now,
          now,
        ),
      db.prepare('UPDATE bean_skus SET stock_grams=stock_grams-?,updated_at=? WHERE id=? AND stock_grams>=?').bind(x.quantity_grams, now, x.sku_id, x.quantity_grams),
      db.prepare("INSERT OR IGNORE INTO stock_movements(id,sku_id,movement_type,delta_grams,reference_id,notes,occurred_at) VALUES(?,?,'order',?,?,?,?)").bind('stock-'+x.id, x.sku_id, -x.quantity_grams, x.id, '创建订单自动扣减', now),
      db
        .prepare(
          "INSERT OR IGNORE INTO order_events(id,order_id,status,occurred_at) VALUES(?,?,'waiting',?)",
        )
        .bind(x.id, x.id, now),
    ]);
    if (!inserted.every((r) => r.success))
      throw new Error('Order transaction failed');
    return json({ id: x.id, code }, 201);
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(request: Request) {
  try {
    const b = await body(request);
    const db = await getD1();
    const id = text(b.id, '记录', 80, true);
    const now = new Date().toISOString();
    if (b.kind === 'shipment-status') {
      const target = text(b.status, '物流状态', 20, true);
      if (target !== 'delivered') throw new InputError('物流状态无效。');
      const r = await db.prepare("UPDATE shipments SET status='delivered',delivered_at=? WHERE id=? AND status='shipped'").bind(now, id).run();
      if (!r.meta.changes) throw new InputError('发货记录已变化，请刷新。', 409);
      return json({ id, status: target });
    }
    if (b.kind === 'batch-status') {
      if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 100) throw new InputError('请选择需要处理的订单。');
      const target = text(b.status, '订单状态', 20, true);
      if (!['roasting', 'completed'].includes(target)) throw new InputError('订单状态无效。');
      const ids = b.ids.map((value) => text(value, '订单', 80, true));
      const expected = target === 'roasting' ? 'waiting' : 'roasting';
      const timestamp = target === 'roasting' ? 'started_at' : 'completed_at';
      const statements = ids.flatMap((orderId) => {
        const eventId = crypto.randomUUID();
        return [
          db.prepare('UPDATE orders SET status=?,' + timestamp + '=?,updated_at=?,last_transition_id=? WHERE id=? AND status=?').bind(target, now, now, eventId, orderId, expected),
          db.prepare('INSERT INTO order_events(id,order_id,status,occurred_at) SELECT ?,id,?,? FROM orders WHERE id=? AND last_transition_id=?').bind(eventId, target, now, orderId, eventId),
        ];
      });
      const results = await db.batch(statements);
      const changed = results.filter((_, index) => index % 2 === 0).reduce((n, r) => n + Number(r.meta.changes), 0);
      if (!changed) throw new InputError('订单进度已变化，请刷新后再操作。', 409);
      return json({ changed, status: target });
    }
    if (b.kind === 'customer') {
      const x = customerInput(b);
      const r = await db
        .prepare(
          'UPDATE customers SET name=?,customer_type=?,contact=?,phone=?,notes=?,updated_at=? WHERE id=?',
        )
        .bind(x.name, x.customer_type, x.contact, x.phone, x.notes, now, id)
        .run();
      if (!r.meta.changes) throw new InputError('客户不存在。', 404);
      return json({ id });
    }
    if (b.kind === 'bean') {
      const x = beanInput(b);
      const r = await db
        .prepare(
          'UPDATE beans SET name=?,origin=?,process=?,variety=?,notes=?,image_key=?,updated_at=? WHERE id=?',
        )
        .bind(
          x.name,
          x.origin,
          x.process,
          x.variety,
          x.notes,
          x.image_key,
          now,
          id,
        )
        .run();
      if (!r.meta.changes) throw new InputError('豆子不存在。', 404);
      return json({ id });
    }
    if (b.kind === 'profile') {
      const x = profileInput(b);
      const revision = number(b.revision, '方案版本', 1, 100000, true);
      const r = await db
        .prepare(
          'UPDATE profiles SET name=?,roast_level=?,machine=?,batch_grams=?,points=?,notes=?,revision=revision+1,updated_at=? WHERE id=? AND bean_id=? AND revision=?',
        )
        .bind(
          x.name,
          x.roast_level,
          x.machine,
          x.batch_grams,
          JSON.stringify(x.points),
          x.notes,
          now,
          id,
          x.bean_id,
          revision,
        )
        .run();
      if (!r.meta.changes)
        throw new InputError('这套方案已被修改，请关闭后重新打开。', 409);
      return json({ id });
    }
    if (b.kind !== 'status') throw new InputError('未找到这个功能。', 404);
    const target = text(b.status, '订单状态', 20, true);
    if (!['roasting', 'completed'].includes(target))
      throw new InputError('订单状态无效。');
    const current = await db
      .prepare('SELECT status FROM orders WHERE id=?')
      .bind(id)
      .first<{ status: string }>();
    if (!current) throw new InputError('订单不存在。', 404);
    if (current.status === target) return json({ id });
    nextStatus(current.status, target);
    const transitionId = crypto.randomUUID();
    const timestamp = target === 'roasting' ? 'started_at' : 'completed_at';
    const results = await db.batch<Record<string, unknown>>([
      db
        .prepare(
          'UPDATE orders SET status=?,' +
            timestamp +
            '=?,updated_at=?,last_transition_id=? WHERE id=? AND status=?',
        )
        .bind(target, now, now, transitionId, id, current.status),
      db
        .prepare(
          'INSERT INTO order_events(id,order_id,status,occurred_at) SELECT ?,id,status,updated_at FROM orders WHERE id=? AND last_transition_id=?',
        )
        .bind(transitionId, id, transitionId),
    ]);
    if (!results[0].meta.changes)
      throw new InputError('订单进度已变化，请刷新后再操作。', 409);
    return json({ id, status: target });
  } catch (e) {
    return failure(e);
  }
}
