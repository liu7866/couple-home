CREATE TABLE `photo_ai` (
	`photo_id` text PRIMARY KEY NOT NULL,
	`description` text NOT NULL,
	`tags` text NOT NULL,
	`category` text NOT NULL,
	`embedding` text NOT NULL,
	`embedding_model` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `photo_ai_jobs` (
	`photo_id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade
);
