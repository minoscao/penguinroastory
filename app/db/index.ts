import { env } from 'cloudflare:workers';
import initialSchema from '../drizzle/0000_initial.sql?raw';
let ready: Promise<unknown> | undefined;
async function upgradeCatalog(db: D1Database) {
  const additions = [
    ['customers', 'customer_type', "TEXT NOT NULL DEFAULT 'unspecified'"],
    ['customers', 'is_demo', 'INTEGER NOT NULL DEFAULT 0'],
    ['beans', 'image_key', "TEXT NOT NULL DEFAULT ''"],
    ['beans', 'is_demo', 'INTEGER NOT NULL DEFAULT 0'],
    ['profiles', 'is_demo', 'INTEGER NOT NULL DEFAULT 0'],
    ['orders', 'is_demo', 'INTEGER NOT NULL DEFAULT 0'],
    ['orders', 'sku_id', "TEXT NOT NULL DEFAULT ''"],
    ['orders', 'sku_snapshot', 'TEXT'],
    ['orders', 'batch_count', 'INTEGER NOT NULL DEFAULT 1'],
    ['orders', 'stock_deducted_grams', 'INTEGER NOT NULL DEFAULT 0'],
  ];
  for (const [table, column, definition] of additions) {
    const info = await db
      .prepare('PRAGMA table_info(' + table + ')')
      .all<{ name: string }>();
    if (info.results.some((x) => x.name === column)) continue;
    try {
      await db
        .prepare(
          'ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + definition,
        )
        .run();
    } catch (error) {
      const after = await db
        .prepare('PRAGMA table_info(' + table + ')')
        .all<{ name: string }>();
      if (!after.results.some((x) => x.name === column)) throw error;
    }
  }
  await db
    .prepare(
      'CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id)',
    )
    .run();
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS bean_skus(id TEXT PRIMARY KEY NOT NULL,bean_id TEXT NOT NULL,label TEXT NOT NULL,harvest_year TEXT NOT NULL DEFAULT '',process TEXT NOT NULL DEFAULT '',altitude_m INTEGER NOT NULL DEFAULT 0,batch_code TEXT NOT NULL DEFAULT '',stock_grams INTEGER NOT NULL DEFAULT 0,is_demo INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(bean_id) REFERENCES beans(id))",
    )
    .run();
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS stock_movements(id TEXT PRIMARY KEY NOT NULL,sku_id TEXT NOT NULL,movement_type TEXT NOT NULL,delta_grams INTEGER NOT NULL,reference_id TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',occurred_at TEXT NOT NULL,FOREIGN KEY(sku_id) REFERENCES bean_skus(id))",
    )
    .run();
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS shipments(id TEXT PRIMARY KEY NOT NULL,order_id TEXT NOT NULL DEFAULT '',customer_name TEXT NOT NULL,carrier TEXT NOT NULL DEFAULT '',tracking_number TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'shipped',is_sample INTEGER NOT NULL DEFAULT 0,notes TEXT NOT NULL DEFAULT '',shipped_at TEXT NOT NULL,delivered_at TEXT)",
    )
    .run();
  for (const statement of [
    'CREATE INDEX IF NOT EXISTS idx_bean_skus_bean ON bean_skus(bean_id)',
    'CREATE INDEX IF NOT EXISTS idx_stock_movements_sku ON stock_movements(sku_id,occurred_at)',
    'CREATE INDEX IF NOT EXISTS idx_shipments_order ON shipments(order_id)',
    'CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status,shipped_at)',
  ])
    await db.prepare(statement).run();

  const now = new Date().toISOString();
  const demoSkus = [
    ['demo-v2-sku-ethiopia', 'demo-v1-bean-ethiopia', '2026 水洗批次', '2026', '水洗', 2050, 'ETH-2601', 18000],
    ['demo-v2-sku-colombia', 'demo-v1-bean-colombia', '2025 蜜处理批次', '2025', '蜜处理', 1850, 'COL-2508', 32000],
    ['demo-v2-sku-brazil', 'demo-v1-bean-brazil', '2025 日晒批次', '2025', '日晒', 1100, 'BRA-2512', 48000],
  ] as const;
  for (const sku of demoSkus)
    await db
      .prepare(
        'INSERT OR IGNORE INTO bean_skus(id,bean_id,label,harvest_year,process,altitude_m,batch_code,stock_grams,is_demo,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,1,?,? WHERE EXISTS(SELECT 1 FROM beans WHERE id=?)',
      )
      .bind(...sku, now, now, sku[1])
      .run();
  await db
    .prepare(
      "UPDATE orders SET sku_id=CASE bean_id WHEN 'demo-v1-bean-ethiopia' THEN 'demo-v2-sku-ethiopia' WHEN 'demo-v1-bean-colombia' THEN 'demo-v2-sku-colombia' WHEN 'demo-v1-bean-brazil' THEN 'demo-v2-sku-brazil' ELSE sku_id END WHERE is_demo=1 AND sku_id=''",
    )
    .run();
}
export async function getD1() {
  if (!env.DB) throw new Error('Database unavailable');
  const db = env.DB as D1Database;
  if (!ready)
    ready = db
      .batch(
        initialSchema
          .split('--> statement-breakpoint')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) =>
            db.prepare(
              s
                .replace(/CREATE TABLE /g, 'CREATE TABLE IF NOT EXISTS ')
                .replace(
                  /CREATE UNIQUE INDEX /g,
                  'CREATE UNIQUE INDEX IF NOT EXISTS ',
                )
                .replace(/CREATE INDEX /g, 'CREATE INDEX IF NOT EXISTS '),
            ),
          ),
      )
      .then(() => upgradeCatalog(db))
      .catch((e) => {
        ready = undefined;
        throw e;
      });
  await ready;
  return db;
}
