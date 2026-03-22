import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  float,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// 处理任务表
export const jobs = mysqlTable("jobs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }),
  productName: varchar("productName", { length: 255 }),
  productKeywords: text("productKeywords"),
  originalVideoUrl: text("originalVideoUrl"),
  originalVideoKey: varchar("originalVideoKey", { length: 512 }),
  originalFileName: varchar("originalFileName", { length: 255 }),
  originalFileSizeMb: float("originalFileSizeMb"),
  status: mysqlEnum("status", [
    "uploading",
    "transcribing",
    "analyzing",
    "clipping",
    "deduplicating",
    "generating_copy",
    "completed",
    "failed",
  ])
    .default("uploading")
    .notNull(),
  progress: int("progress").default(0),
  errorMessage: text("errorMessage"),
  totalClips: int("totalClips").default(0),
  hookStyle: mysqlEnum("hookStyle", ["suspense", "pain_point", "benefit"]).default("suspense"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Job = typeof jobs.$inferSelect;
export type InsertJob = typeof jobs.$inferInsert;

// 转录文本表
export const transcripts = mysqlTable("transcripts", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  fullText: text("fullText"),
  segments: json("segments"), // Array of { start, end, text }
  language: varchar("language", { length: 16 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Transcript = typeof transcripts.$inferSelect;
export type InsertTranscript = typeof transcripts.$inferInsert;

// 切片视频表
export const clips = mysqlTable("clips", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  clipIndex: int("clipIndex").notNull(),
  startTime: float("startTime").notNull(),
  endTime: float("endTime").notNull(),
  duration: float("duration").notNull(),
  productSegment: text("productSegment"),
  videoUrl: text("videoUrl"),
  videoKey: varchar("videoKey", { length: 512 }),
  srtUrl: text("srtUrl"),
  srtKey: varchar("srtKey", { length: 512 }),
  srtContent: text("srtContent"),
  title: text("title"),
  copywriting: text("copywriting"),
  hashtags: text("hashtags"),
  hookText: text("hookText"),
  status: mysqlEnum("status", [
    "pending",
    "clipping",
    "deduplicating",
    "generating_copy",
    "completed",
    "failed",
  ])
    .default("pending")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Clip = typeof clips.$inferSelect;
export type InsertClip = typeof clips.$inferInsert;
