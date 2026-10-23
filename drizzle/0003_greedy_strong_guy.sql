CREATE TABLE `recovery_codes` (
	`slot` integer PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
