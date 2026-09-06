CREATE TABLE IF NOT EXISTS `bean_skus` (
  `id` text PRIMARY KEY NOT NULL,
  `bean_id` text NOT NULL,
  `label` text NOT NULL,
  `harvest_year` text DEFAULT '' NOT NULL,
  `process` text DEFAULT '' NOT NULL,
  `altitude_m` integer DEFAULT 0 NOT NULL,
  `batch_code` text DEFAULT '' NOT NULL,
  `stock_grams` integer DEFAULT 0 NOT NULL,
  `is_demo` integer DEFAULT 0 NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`bean_id`) REFERENCES `beans`(`id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_bean_skus_bean` ON `bean_skus` (`bean_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id` text PRIMARY KEY NOT NULL,
  `sku_id` text NOT NULL,
  `movement_type` text NOT NULL,
  `delta_grams` integer NOT NULL,
  `reference_id` text DEFAULT '' NOT NULL,
  `notes` text DEFAULT '' NOT NULL,
  `occurred_at` text NOT NULL,
  FOREIGN KEY (`sku_id`) REFERENCES `bean_skus`(`id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_stock_movements_sku` ON `stock_movements` (`sku_id`,`occurred_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `shipments` (
  `id` text PRIMARY KEY NOT NULL,
  `order_id` text DEFAULT '' NOT NULL,
  `customer_name` text NOT NULL,
  `carrier` text DEFAULT '' NOT NULL,
  `tracking_number` text DEFAULT '' NOT NULL,
  `status` text DEFAULT 'shipped' NOT NULL,
  `is_sample` integer DEFAULT 0 NOT NULL,
  `notes` text DEFAULT '' NOT NULL,
  `shipped_at` text NOT NULL,
  `delivered_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_shipments_order` ON `shipments` (`order_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_shipments_status` ON `shipments` (`status`,`shipped_at`);
--> statement-breakpoint
ALTER TABLE `orders` ADD `sku_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `sku_snapshot` text;
--> statement-breakpoint
ALTER TABLE `orders` ADD `batch_count` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `stock_deducted_grams` integer DEFAULT 0 NOT NULL;
