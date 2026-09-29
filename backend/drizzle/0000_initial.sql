CREATE TABLE `decks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game` text NOT NULL,
	`name` text NOT NULL,
	`raw_text` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `deck_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`deck_id` integer NOT NULL,
	`section` text NOT NULL,
	`quantity` integer NOT NULL,
	`name` text NOT NULL,
	`card_key` text,
	`identifiers` text NOT NULL,
	`error` text,
	`auto` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deck_entries_deck_idx` ON `deck_entries` (`deck_id`);
--> statement-breakpoint
CREATE INDEX `deck_entries_card_idx` ON `deck_entries` (`card_key`);
--> statement-breakpoint
CREATE TABLE `cards` (
	`card_key` text PRIMARY KEY NOT NULL,
	`game` text NOT NULL,
	`name` text NOT NULL,
	`layout` text NOT NULL,
	`faces` text NOT NULL,
	`meta` text,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `card_images` (
	`card_key` text NOT NULL,
	`face_index` integer NOT NULL,
	`path` text,
	`bytes` integer,
	`status` text NOT NULL,
	`error` text,
	PRIMARY KEY(`card_key`, `face_index`),
	FOREIGN KEY (`card_key`) REFERENCES `cards`(`card_key`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `match_players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_id` integer NOT NULL,
	`seat` integer NOT NULL,
	`player_name` text NOT NULL,
	`deck_id` integer,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `match_players_seat_idx` ON `match_players` (`match_id`,`seat`);
--> statement-breakpoint
CREATE TABLE `settings` (
	`scope` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`scope`, `key`)
);
