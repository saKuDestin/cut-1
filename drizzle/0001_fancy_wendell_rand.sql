CREATE TABLE `clips` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`clipIndex` int NOT NULL,
	`startTime` float NOT NULL,
	`endTime` float NOT NULL,
	`duration` float NOT NULL,
	`productSegment` text,
	`videoUrl` text,
	`videoKey` varchar(512),
	`srtUrl` text,
	`srtKey` varchar(512),
	`srtContent` text,
	`title` text,
	`copywriting` text,
	`hashtags` text,
	`status` enum('pending','clipping','deduplicating','generating_copy','completed','failed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clips_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255),
	`productName` varchar(255),
	`productKeywords` text,
	`originalVideoUrl` text,
	`originalVideoKey` varchar(512),
	`originalFileName` varchar(255),
	`originalFileSizeMb` float,
	`status` enum('uploading','transcribing','analyzing','clipping','deduplicating','generating_copy','completed','failed') NOT NULL DEFAULT 'uploading',
	`progress` int DEFAULT 0,
	`errorMessage` text,
	`totalClips` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transcripts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`fullText` text,
	`segments` json,
	`language` varchar(16),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transcripts_id` PRIMARY KEY(`id`)
);
