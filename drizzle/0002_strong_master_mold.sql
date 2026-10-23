CREATE TABLE `member_passwords` (
	`slot` integer PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`salt` text NOT NULL,
	`password_hash` text NOT NULL,
	`version` text NOT NULL,
	`created_at` integer NOT NULL
);
