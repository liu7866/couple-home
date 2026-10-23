CREATE TABLE `auth_attempts` (
	`ip_hash` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `home_keys` (
	`slot` integer PRIMARY KEY NOT NULL,
	`key_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `home_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`key_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
