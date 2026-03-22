import { eq, desc, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import {
  InsertUser,
  users,
  jobs,
  clips,
  transcripts,
  InsertJob,
  InsertClip,
  InsertTranscript,
  Job,
  Clip,
  User,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      const isTiDB = url.hostname.includes("tidbcloud.com");
      const pool = mysql.createPool({
        host: url.hostname,
        port: parseInt(url.port) || 3306,
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname.replace(/^\//, ""),
        ssl: isTiDB ? { rejectUnauthorized: true } : undefined,
        waitForConnections: true,
        connectionLimit: 10,
      });
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod", "passwordHash"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ===== 品牌人设持久化 =====
export async function updateUserBrandPersona(
  userId: number,
  data: { brandPersona?: string; styleKeywords?: string[]; excludeKeywords?: string[] }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(users).set(data as Partial<User>).where(eq(users.id, userId));
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

// ===== Jobs =====
export async function createJob(data: InsertJob) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(jobs).values(data);
  const insertId = (result[0] as any).insertId;
  const rows = await db.select().from(jobs).where(eq(jobs.id, insertId)).limit(1);
  return rows[0];
}

export async function getJobById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getJobsByUserId(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // 只返回未软删除的任务
  return db
    .select()
    .from(jobs)
    .where(eq(jobs.userId, userId))
    .orderBy(desc(jobs.createdAt));
}

export async function updateJob(id: number, data: Partial<Job>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(jobs).set(data).where(eq(jobs.id, id));
}

/**
 * 软删除任务（标记 deletedAt，不物理删除）
 */
export async function softDeleteJob(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(jobs).set({ deletedAt: new Date() }).where(eq(jobs.id, id));
}

/**
 * 重置任务状态为可重新处理（仅限 failed 状态）
 */
export async function resetJobForRetry(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // 删除旧的 clips 记录
  await db.delete(clips).where(eq(clips.jobId, id));
  // 删除旧的 transcripts 记录
  await db.delete(transcripts).where(eq(transcripts.jobId, id));
  // 重置 job 状态
  await db.update(jobs).set({
    status: "transcribing",
    progress: 5,
    errorMessage: null,
    totalClips: 0,
  }).where(eq(jobs.id, id));
}

// ===== Transcripts =====
export async function createTranscript(data: InsertTranscript) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(transcripts).values(data);
}

export async function getTranscriptByJobId(jobId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db.select().from(transcripts).where(eq(transcripts.jobId, jobId)).limit(1);
  return rows[0] ?? null;
}

// ===== Clips =====
export async function createClip(data: InsertClip) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(clips).values(data);
  const insertId = (result[0] as any).insertId;
  const rows = await db.select().from(clips).where(eq(clips.id, insertId)).limit(1);
  return rows[0];
}

export async function getClipsByJobId(jobId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.select().from(clips).where(eq(clips.jobId, jobId)).orderBy(clips.clipIndex);
}

export async function updateClip(id: number, data: Partial<Clip>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(clips).set(data).where(eq(clips.id, id));
}
