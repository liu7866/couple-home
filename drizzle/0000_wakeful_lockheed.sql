CREATE TABLE `home_events` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`user_id` text PRIMARY KEY NOT NULL,
	`slot` integer NOT NULL,
	`display_name` text NOT NULL,
	`last_seen` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_slot_unique` ON `members` (`slot`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`caption` text NOT NULL,
	`created_at` integer NOT NULL,
	`user_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `room_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
