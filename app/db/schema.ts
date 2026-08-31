import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  index,
  check,
} from 'drizzle-orm/sqlite-core';
export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(),
  customer_type: text('customer_type').notNull().default('unspecified'),
  is_demo: integer('is_demo').notNull().default(0),
  name: text('name').notNull(),
  contact: text('contact').notNull().default(''),
  phone: text('phone').notNull().default(''),
  notes: text('notes').notNull().default(''),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});
export const beans = sqliteTable('beans', {
  id: text('id').primaryKey(),
  image_key: text('image_key').notNull().default(''),
  is_demo: integer('is_demo').notNull().default(0),
  name: text('name').notNull(),
  origin: text('origin').notNull().default(''),
  process: text('process').notNull().default(''),
  variety: text('variety').notNull().default(''),
  notes: text('notes').notNull().default(''),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});
export const profiles = sqliteTable(
  'profiles',
  {
    id: text('id').primaryKey(),
    is_demo: integer('is_demo').notNull().default(0),
    bean_id: text('bean_id')
      .notNull()
      .references(() => beans.id),
    name: text('name').notNull(),
    roast_level: text('roast_level').notNull(),
    machine: text('machine').notNull().default(''),
    batch_grams: integer('batch_grams').notNull(),
    points: text('points').notNull(),
    notes: text('notes').notNull().default(''),
    revision: integer('revision').notNull().default(1),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
  },
  (t) => [
    index('idx_profiles_bean').on(t.bean_id),
    check('profile_weight_positive', sql`${t.batch_grams}>0`),
  ],
);
export const orders = sqliteTable(
  'orders',
  {
    id: text('id').primaryKey(),
    is_demo: integer('is_demo').notNull().default(0),
    code: text('code').notNull().unique(),
    customer_id: text('customer_id')
      .notNull()
      .references(() => customers.id),
    bean_id: text('bean_id')
      .notNull()
      .references(() => beans.id),
    profile_id: text('profile_id')
      .notNull()
      .references(() => profiles.id),
    customer_name: text('customer_name').notNull(),
    bean_name: text('bean_name').notNull(),
    profile_snapshot: text('profile_snapshot').notNull(),
    quantity_grams: integer('quantity_grams').notNull(),
    due_date: text('due_date').notNull().default(''),
    notes: text('notes').notNull().default(''),
    status: text('status').notNull().default('waiting'),
    created_at: text('created_at').notNull(),
    started_at: text('started_at'),
    completed_at: text('completed_at'),
    updated_at: text('updated_at').notNull(),
    last_transition_id: text('last_transition_id'),
  },
  (t) => [
    index('idx_orders_status_created').on(t.status, t.created_at),
    index('idx_orders_created').on(t.created_at),
    index('idx_orders_customer').on(t.customer_id),
    check(
      'order_status_valid',
      sql`${t.status} IN ('waiting','roasting','completed')`,
    ),
    check('order_quantity_positive', sql`${t.quantity_grams}>0`),
  ],
);
export const orderEvents = sqliteTable(
  'order_events',
  {
    id: text('id').primaryKey(),
    order_id: text('order_id')
      .notNull()
      .references(() => orders.id),
    status: text('status').notNull(),
    occurred_at: text('occurred_at').notNull(),
  },
  (t) => [index('idx_order_events_order').on(t.order_id, t.occurred_at)],
);
