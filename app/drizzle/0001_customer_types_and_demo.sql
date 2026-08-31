ALTER TABLE `beans` ADD `image_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `beans` ADD `is_demo` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `customer_type` text DEFAULT 'unspecified' NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `is_demo` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `is_demo` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_orders_customer` ON `orders` (`customer_id`);--> statement-breakpoint
ALTER TABLE `profiles` ADD `is_demo` integer DEFAULT 0 NOT NULL;