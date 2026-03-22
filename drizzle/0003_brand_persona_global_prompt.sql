-- 为 users 表添加品牌人设持久化字段
ALTER TABLE `users` ADD `brandPersona` text;--> statement-breakpoint
ALTER TABLE `users` ADD `styleKeywords` json;--> statement-breakpoint
ALTER TABLE `users` ADD `excludeKeywords` json;--> statement-breakpoint

-- 为 jobs 表添加全局提示词字段和软删除字段
ALTER TABLE `jobs` ADD `globalPrompt` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `deletedAt` timestamp;
