CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `degree_practices` (
	`degree_id` integer NOT NULL,
	`practice_id` integer NOT NULL,
	PRIMARY KEY(`degree_id`, `practice_id`),
	FOREIGN KEY (`degree_id`) REFERENCES `degrees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`practice_id`) REFERENCES `practices`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_degree_practices_practice_id` ON `degree_practices` (`practice_id`);--> statement-breakpoint
CREATE TABLE `degrees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`level` text NOT NULL,
	`academic_year` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_degrees_code` ON `degrees` (`code`);--> statement-breakpoint
CREATE TABLE `installations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`laboratory_id` integer NOT NULL,
	`category` text NOT NULL,
	`capacity` integer NOT NULL,
	`status` text DEFAULT 'Operativa' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`laboratory_id`) REFERENCES `laboratories`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_installations_code` ON `installations` (`code`);--> statement-breakpoint
CREATE INDEX `idx_installations_laboratory_id` ON `installations` (`laboratory_id`);--> statement-breakpoint
CREATE TABLE `laboratories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`location` text NOT NULL,
	`manager` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_laboratories_code` ON `laboratories` (`code`);--> statement-breakpoint
CREATE TABLE `practices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`installation_id` integer NOT NULL,
	`duration` integer NOT NULL,
	`risk_level` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`installation_id`) REFERENCES `installations`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_practices_code` ON `practices` (`code`);--> statement-breakpoint
CREATE INDEX `idx_practices_installation_id` ON `practices` (`installation_id`);