import { getD1 } from '@/db';
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
  roastRecordInput,
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
    roast_record:
      typeof row.roast_record === 'string' && row.roast_record
        ? JSON.parse(row.roast_record)
        : null,
  };
}
function failure(e: unknown) {
  if (e instanceof InputError) return json({ error: e.message }, e.status);
  const detail = e instanceof Error ? e.message : String(e);
  if (detail.includes('ROAST_CONFLICT'))
    return json(
      { error: '另一台设备已更新这锅记录，请关闭并重新打开后继续。' },
      409,
    );
  if (detail.includes('roast_machine_locks'))
    return json({ error: '烘焙机已被另一锅占用，请刷新工作台。' }, 409);
  if (detail.includes('STOCK_INSUFFICIENT'))
    return json({ error: '库存不足，订单没有创建，请补充库存后重试。' }, 409);
  if (detail.includes('SHIPMENT_DUPLICATE'))
    return json({ error: '这张订单已登记发货，请刷新查看。' }, 409);
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
  if (raw.length > 250000) throw new InputError('提交内容过长。', 413);
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
    const date = text(p.get('date'), '日期', 10);
    if (
      date &&
      !/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(date)
    )
      throw new InputError('日期格式不正确。');
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
          "SELECT * FROM profiles WHERE id NOT LIKE 'pending-profile-%'" +
            (realOnly ? ' AND is_demo=0' : '') +
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
      const orderDate = date
        ? " AND (status='roasting' OR date(created_at,'+8 hours') LIKE ?)"
        : '';
      const shipmentDate = date
        ? realOnly
          ? " AND date(s.shipped_at,'+8 hours') LIKE ?"
          : " WHERE date(s.shipped_at,'+8 hours') LIKE ?"
        : '';
      const [active, completed, shipments, movements] = await db.batch<
        Record<string, unknown>
      >([
        db
          .prepare(
            "SELECT * FROM orders WHERE status IN ('waiting','roasting')" +
              (realOnly ? ' AND is_demo=0' : '') +
              orderDate +
              ' ORDER BY due_date ASC,created_at ASC LIMIT 300',
          )
          .bind(...(date ? [date + '%'] : [])),
        db
          .prepare(
            "SELECT * FROM orders WHERE status='completed' AND NOT EXISTS(SELECT 1 FROM shipments WHERE shipments.order_id=orders.id)" +
              (realOnly ? ' AND is_demo=0' : '') +
              (date ? " AND date(completed_at,'+8 hours') LIKE ?" : '') +
              ' ORDER BY completed_at DESC LIMIT 300',
          )
          .bind(...(date ? [date + '%'] : [])),
        db
          .prepare(
            'SELECT s.*,o.code AS order_code,o.bean_name,o.quantity_grams FROM shipments s LEFT JOIN orders o ON o.id=s.order_id' +
              (realOnly ? ' WHERE (s.is_sample=1 OR o.is_demo=0)' : '') +
              shipmentDate +
              ' ORDER BY s.shipped_at DESC LIMIT 300',
          )
          .bind(...(date ? [date + '%'] : [])),
        db.prepare(
          'SELECT m.*,s.label AS sku_label,b.name AS bean_name FROM stock_movements m JOIN bean_skus s ON s.id=m.sku_id JOIN beans b ON b.id=s.bean_id' +
            (realOnly ? ' WHERE s.is_demo=0' : '') +
            ' ORDER BY m.occurred_at DESC LIMIT 80',
        ),
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
    if (date) {
      conditions.push(
        `date(${p.get('date_field') === 'completed' ? 'completed_at' : 'created_at'},'+8 hours') LIKE ?`,
      );
      bindings.push(date + '%');
    }
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
          'INSERT INTO beans(id,name,origin,process,altitude,variety,notes,image_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          id,
          x.name,
          x.origin,
          x.process,
          x.altitude,
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
      const sourceBean = await db
        .prepare('SELECT is_demo FROM beans WHERE id=?')
        .bind(x.bean_id)
        .first<{ is_demo: number }>();
      if (!sourceBean) throw new InputError('请先保存这款豆子。');
      await db
        .prepare(
          'INSERT INTO bean_skus(id,bean_id,label,harvest_year,process,altitude_m,batch_code,stock_grams,is_demo,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          id,
          x.bean_id,
          x.label,
          x.harvest_year,
          x.process,
          x.altitude_m,
          x.batch_code,
          x.stock_grams,
          sourceBean.is_demo || 0,
          now,
          now,
        )
        .run();
      if (x.stock_grams > 0)
        await db
          .prepare(
            "INSERT INTO stock_movements(id,sku_id,movement_type,delta_grams,reference_id,notes,occurred_at) VALUES(?,?,'in',?,'','创建批次时录入',?)",
          )
          .bind('stock-' + id, id, x.stock_grams, now)
          .run();
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
      const sku = await db
        .prepare('SELECT stock_grams FROM bean_skus WHERE id=?')
        .bind(x.sku_id)
        .first<{ stock_grams: number }>();
      if (!sku) throw new InputError('找不到这个豆子批次。', 404);
      if (Number(sku.stock_grams) + x.delta_grams < 0)
        throw new InputError('调整后的库存不能小于 0。');
      const movementType = x.delta_grams > 0 ? 'in' : 'adjustment';
      await db.batch([
        db
          .prepare(
            'UPDATE bean_skus SET stock_grams=stock_grams+?,updated_at=? WHERE id=?',
          )
          .bind(x.delta_grams, now, x.sku_id),
        db
          .prepare(
            'INSERT INTO stock_movements(id,sku_id,movement_type,delta_grams,reference_id,notes,occurred_at) VALUES(?,?,?,?,?,?,?)',
          )
          .bind(id, x.sku_id, movementType, x.delta_grams, '', x.notes, now),
      ]);
      return json({ id }, 201);
    }
    if (b.kind === 'shipment') {
      const x = shipmentInput(b);
      if (x.order_id) {
        const order = await db
          .prepare("SELECT id FROM orders WHERE id=? AND status='completed'")
          .bind(x.order_id)
          .first();
        if (!order) throw new InputError('这张订单还没有完成烘焙。');
        const existingShipment = await db
          .prepare('SELECT id FROM shipments WHERE order_id=?')
          .bind(x.order_id)
          .first();
        if (existingShipment)
          throw new InputError('这张订单已经登记过发货。', 409);
      }
      await db
        .prepare(
          "INSERT INTO shipments(id,order_id,customer_name,carrier,tracking_number,status,is_sample,notes,shipped_at) VALUES(?,?,?,?,?,'shipped',?,?,?)",
        )
        .bind(
          id,
          x.order_id,
          x.customer_name,
          x.carrier,
          x.tracking_number,
          x.is_sample,
          x.notes,
          now,
        )
        .run();
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
      x.profile_id
        ? db
            .prepare('SELECT * FROM profiles WHERE id=? AND bean_id=?')
            .bind(x.profile_id, x.bean_id)
            .first()
        : Promise.resolve(null),
      x.sku_id
        ? db
            .prepare('SELECT * FROM bean_skus WHERE id=? AND bean_id=?')
            .bind(x.sku_id, x.bean_id)
            .first()
        : db
            .prepare(
              'SELECT * FROM bean_skus WHERE bean_id=? AND stock_grams>=? ORDER BY stock_grams DESC LIMIT 1',
            )
            .bind(x.bean_id, x.quantity_grams)
            .first(),
    ]);
    if (!customer || !bean || !sku)
      throw new InputError('客户、豆子或可用库存已变化，请重新选择。');
    if (Number(sku.stock_grams) < x.quantity_grams)
      throw new InputError('这款豆子的库存不足，请先入库或减少订单重量。');
    const pendingProfileId = 'pending-profile-' + x.bean_id;
    const profile = profileRow
      ? (decodeProfile(profileRow) as Profile)
      : {
          id: pendingProfileId,
          is_demo: Number(bean.is_demo || 0),
          bean_id: x.bean_id,
          name: '烘焙时决定',
          roast_level: '待确定',
          machine: '',
          batch_grams: 0,
          points: [],
          notes: '系统占位记录：真正的烘焙方案在开始本锅时决定。',
          revision: 0,
          created_at: now,
          updated_at: now,
        };
    const isDemo = customer.is_demo || bean.is_demo || profile.is_demo ? 1 : 0;
    const code =
      'PR-' +
      now.slice(0, 10).replaceAll('-', '') +
      '-' +
      x.id.replaceAll('-', '').slice(0, 8).toUpperCase();
    if (!profileRow)
      await db
        .prepare(
          'INSERT OR IGNORE INTO profiles(id,bean_id,name,roast_level,machine,batch_grams,points,notes,revision,is_demo,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,?,?,?)',
        )
        .bind(
          profile.id,
          x.bean_id,
          profile.name,
          profile.roast_level,
          '',
          1,
          '[]',
          profile.notes,
          profile.is_demo,
          now,
          now,
        )
        .run();
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
          profile.id,
          customer.name,
          bean.name,
          sku.id,
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
      db
        .prepare(
          'UPDATE bean_skus SET stock_grams=stock_grams-?,updated_at=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM stock_movements WHERE id=?)',
        )
        .bind(x.quantity_grams, now, sku.id, 'stock-' + x.id),
      db
        .prepare(
          "INSERT OR IGNORE INTO stock_movements(id,sku_id,movement_type,delta_grams,reference_id,notes,occurred_at) VALUES(?,?,'order',?,?,?,?)",
        )
        .bind(
          'stock-' + x.id,
          sku.id,
          -x.quantity_grams,
          x.id,
          '创建订单自动扣减',
          now,
        ),
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
    const now = new Date().toISOString();
    if (
      ['roast-start', 'roast-record', 'roast-finish'].includes(String(b.kind))
    ) {
      const x = roastRecordInput(b);
      const expectedRevision = number(
        b.expected_revision ?? 0,
        '曲线版本',
        0,
        100000,
        true,
      );
      const rows = await db
        .prepare(
          'SELECT * FROM orders WHERE id IN (' +
            x.ids.map(() => '?').join(',') +
            ')',
        )
        .bind(...x.ids)
        .all<Record<string, unknown>>();
      if (rows.results.length !== x.ids.length)
        throw new InputError('有订单不存在，无法保存这锅的曲线。', 404);
      if (
        rows.results.some(
          (row) => Number(row.roast_revision) !== expectedRevision,
        )
      )
        throw new InputError(
          '另一台设备已更新这锅记录，请关闭并重新打开后继续。',
          409,
        );
      const starting = b.kind === 'roast-start';
      const finishing = b.kind === 'roast-finish';
      if (starting && rows.results.some((row) => row.status !== 'waiting'))
        throw new InputError('订单已经开始，请刷新后继续当前烘焙。', 409);
      if (!starting && rows.results.some((row) => row.status === 'waiting'))
        throw new InputError('请先准备入豆并开始录豆。', 409);
      if (finishing && rows.results.some((row) => row.status !== 'roasting'))
        throw new InputError('这锅已经完成，请刷新查看。', 409);
      const storedRecord = rows.results[0].roast_record;
      const previous =
        typeof storedRecord === 'string' && storedRecord
          ? JSON.parse(storedRecord)
          : null;
      const linkedIds: string[] = previous?.orderIds || x.ids;
      if (
        !starting &&
        (linkedIds.length !== x.ids.length ||
          linkedIds.some((id) => !x.ids.includes(id)))
      )
        throw new InputError(
          '请从烘焙工作台打开整锅记录，合并订单需要一起保存。',
          409,
        );
      let referenceProfile = previous?.referenceProfile;
      if (starting) {
        if (new Set(rows.results.map((row) => row.bean_id)).size !== 1)
          throw new InputError('一锅只能合并相同豆子的订单。');
        const active = await db
          .prepare("SELECT id FROM orders WHERE status='roasting' LIMIT 1")
          .first();
        if (active)
          throw new InputError('烘焙机正在使用，请先完成当前这一锅。', 409);
        if (x.record.target.profileId) {
          const selected = await db
            .prepare('SELECT * FROM profiles WHERE id=? AND bean_id=?')
            .bind(x.record.target.profileId, rows.results[0].bean_id)
            .first();
          if (!selected)
            throw new InputError('所选方案已变化，请重新选择。', 409);
          referenceProfile = decodeProfile(selected);
        }
        if (
          !x.record.records.some(
            (point) => point.stage === '入豆' && point.seconds === 0,
          ) ||
          x.record.chargedGrams <= 0
        )
          throw new InputError('请填写入豆温度和克重，入豆时间应为 0:00。');
      }
      const record = {
        ...x.record,
        orderIds: x.ids,
        ...(referenceProfile ? { referenceProfile } : {}),
      };
      const payload = JSON.stringify(record);
      const statements: D1PreparedStatement[] = [];
      if (starting)
        statements.push(
          db
            .prepare(
              'INSERT INTO roast_machine_locks(machine,batch_id) VALUES(?,?)',
            )
            .bind('single-roaster', [...x.ids].sort().join(',')),
        );
      for (const orderId of x.ids) {
        statements.push(
          db
            .prepare(
              'UPDATE orders SET roast_record=?,roast_revision=?,updated_at=? WHERE id=?',
            )
            .bind(payload, expectedRevision + 1, now, orderId),
        );
        if (starting || finishing) {
          const status = starting ? 'roasting' : 'completed';
          statements.push(
            db
              .prepare(
                `UPDATE orders SET status=?,${starting ? 'started_at' : 'completed_at'}=? WHERE id=?`,
              )
              .bind(
                status,
                starting ? new Date(x.record.startedAt).toISOString() : now,
                orderId,
              ),
          );
          statements.push(
            db
              .prepare(
                'INSERT INTO order_events(id,order_id,status,occurred_at) VALUES(?,?,?,?)',
              )
              .bind(crypto.randomUUID(), orderId, status, now),
          );
        }
      }
      if (finishing)
        statements.push(
          db
            .prepare('DELETE FROM roast_machine_locks WHERE machine=?')
            .bind('single-roaster'),
        );
      await db.batch(statements);
      return json({
        updated: x.ids.length,
        revision: expectedRevision + 1,
        record,
      });
    }
    const id = text(b.id, '记录', 80, true);
    if (b.kind === 'shipment-status') {
      const target = text(b.status, '物流状态', 20, true);
      if (target !== 'delivered') throw new InputError('物流状态无效。');
      const r = await db
        .prepare(
          "UPDATE shipments SET status='delivered',delivered_at=? WHERE id=? AND status='shipped'",
        )
        .bind(now, id)
        .run();
      if (!r.meta.changes)
        throw new InputError('发货记录已变化，请刷新。', 409);
      return json({ id, status: target });
    }
    if (b.kind === 'batch-status' || b.kind === 'status')
      throw new InputError(
        '请通过烘焙记录台开始或完成烘焙，确保曲线与订单一起保存。',
        409,
      );
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
          'UPDATE beans SET name=?,origin=?,process=?,altitude=?,variety=?,notes=?,image_key=?,updated_at=? WHERE id=?',
        )
        .bind(
          x.name,
          x.origin,
          x.process,
          x.altitude,
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
    throw new InputError('未找到这个功能。', 404);
  } catch (e) {
    return failure(e);
  }
}

export async function DELETE(request: Request) {
  try {
    const b = await body(request);
    const db = await getD1();
    const id = text(b.id, '档案', 80, true);
    const kind = text(b.kind, '档案类型', 20, true);
    if (kind === 'customer') {
      const order = await db
        .prepare('SELECT code FROM orders WHERE customer_id=? LIMIT 1')
        .bind(id)
        .first<{ code: string }>();
      if (order)
        throw new InputError(
          `客户已有订单 ${order.code}，为了保留订单追溯，暂时不能删除。`,
          409,
        );
      const result = await db
        .prepare('DELETE FROM customers WHERE id=?')
        .bind(id)
        .run();
      if (!result.meta.changes) throw new InputError('客户档案不存在。', 404);
      return json({ id });
    }

    if (kind === 'bean') {
      const order = await db
        .prepare('SELECT code FROM orders WHERE bean_id=? LIMIT 1')
        .bind(id)
        .first<{ code: string }>();
      if (order)
        throw new InputError(
          `这款豆子已有订单 ${order.code}，为了保留订单追溯，暂时不能删除。`,
          409,
        );
      const skus = await db
        .prepare('SELECT id FROM bean_skus WHERE bean_id=?')
        .bind(id)
        .all<{ id: string }>();
      const statements = [
        ...skus.results.map((sku) =>
          db.prepare('DELETE FROM stock_movements WHERE sku_id=?').bind(sku.id),
        ),
        db.prepare('DELETE FROM profiles WHERE bean_id=?').bind(id),
        db.prepare('DELETE FROM bean_skus WHERE bean_id=?').bind(id),
        db.prepare('DELETE FROM beans WHERE id=?').bind(id),
      ];
      const results = await db.batch(statements);
      if (!results.at(-1)?.meta.changes)
        throw new InputError('豆子档案不存在。', 404);
      return json({ id });
    }
    throw new InputError('这个档案暂不支持删除。', 404);
  } catch (e) {
    return failure(e);
  }
}
