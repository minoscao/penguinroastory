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
