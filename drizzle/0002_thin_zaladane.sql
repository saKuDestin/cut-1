ALTER TABLE `clips` ADD `hookText` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `hookStyle` enum('suspense','pain_point','benefit') DEFAULT 'suspense';