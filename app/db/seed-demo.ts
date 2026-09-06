import { makeDemoDataset } from '../lib/demo-data';

export async function seedDemo(db: D1Database) {
  const data = makeDemoDataset();
  const statements: D1PreparedStatement[] = [];
  for (const b of data.beans)
    statements.push(
      db
        .prepare(
          'INSERT OR IGNORE INTO beans(id,name,origin,process,variety,notes,image_key,is_demo,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?)',
        )
        .bind(
          b.id,
          b.name,
          b.origin,
          b.process,
          b.variety,
          b.notes,
          b.image_key,
          b.created_at,
          b.updated_at,
        ),
    );
  const demoSkus = [
    ['demo-v2-sku-ethiopia', 'demo-v1-bean-ethiopia', '2026 水洗批次', '2026', '水洗', 2050, 'ETH-2601', 18000],
    ['demo-v2-sku-colombia', 'demo-v1-bean-colombia', '2025 蜜处理批次', '2025', '蜜处理', 1850, 'COL-2508', 32000],
    ['demo-v2-sku-brazil', 'demo-v1-bean-brazil', '2025 日晒批次', '2025', '日晒', 1100, 'BRA-2512', 48000],
  ] as const;
  for (const s of demoSkus)
    statements.push(
      db.prepare('INSERT OR IGNORE INTO bean_skus(id,bean_id,label,harvest_year,process,altitude_m,batch_code,stock_grams,is_demo,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,?,?)').bind(...s, new Date().toISOString(), new Date().toISOString()),
    );
  for (const c of data.customers)
    statements.push(
      db
        .prepare(
          'INSERT OR IGNORE INTO customers(id,name,customer_type,contact,phone,notes,is_demo,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?)',
        )
        .bind(
          c.id,
          c.name,
          c.customer_type,
          c.contact,
          c.phone,
          c.notes,
          c.created_at,
          c.updated_at,
        ),
    );
  for (const p of data.profiles)
    statements.push(
      db
        .prepare(
          'INSERT OR IGNORE INTO profiles(id,bean_id,name,roast_level,machine,batch_grams,points,notes,revision,is_demo,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,1,?,?)',
        )
        .bind(
          p.id,
          p.bean_id,
          p.name,
          p.roast_level,
          p.machine,
          p.batch_grams,
          JSON.stringify(p.points),
          p.notes,
          p.created_at,
          p.updated_at,
        ),
    );
  for (const o of data.orders)
    statements.push(
      db
        .prepare(
          'INSERT OR IGNORE INTO orders(id,code,customer_id,bean_id,profile_id,customer_name,bean_name,sku_id,sku_snapshot,profile_snapshot,quantity_grams,batch_count,stock_deducted_grams,due_date,notes,status,is_demo,created_at,started_at,completed_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)',
        )
        .bind(
          o.id,
          o.code,
          o.customer_id,
          o.bean_id,
          o.profile_id,
          o.customer_name,
          o.bean_name,
          o.sku_id,
          null,
          JSON.stringify(o.profile_snapshot),
          o.quantity_grams,
          o.batch_count,
          0,
          o.due_date,
          o.notes,
          o.status,
          o.created_at,
          o.started_at,
          o.completed_at,
          o.updated_at,
        ),
    );
  for (const e of data.events)
    statements.push(
      db
        .prepare(
          'INSERT OR IGNORE INTO order_events(id,order_id,status,occurred_at) VALUES(?,?,?,?)',
        )
        .bind(e.id, e.order_id, e.status, e.occurred_at),
    );
  const results = await db.batch(statements);
  return {
    addedRows: results.reduce((n, r) => n + Number(r.meta.changes), 0),
    customers: 16,
    beans: 3,
    profiles: 6,
    orders: 24,
  };
}
