import { env } from 'cloudflare:workers';
import initialSchema from '../drizzle/0000_initial.sql?raw';
let ready: Promise<unknown> | undefined;
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
      .catch((e) => {
        ready = undefined;
        throw e;
      });
  await ready;
  return db;
}
