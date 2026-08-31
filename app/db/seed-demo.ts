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
          'INSERT OR IGNORE INTO orders(id,code,customer_id,bean_id,profile_id,customer_name,bean_name,profile_snapshot,quantity_grams,due_date,notes,status,is_demo,created_at,started_at,completed_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)',
        )
        .bind(
          o.id,
          o.code,
          o.customer_id,
          o.bean_id,
          o.profile_id,
          o.customer_name,
          o.bean_name,
          JSON.stringify(o.profile_snapshot),
          o.quantity_grams,
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
