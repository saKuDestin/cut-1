/**
 * 认证模块 - 账号密码登录 + JWT Cookie 会话
 * 替代原 Manus OAuth 认证体系
 */
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { Request, Response, Express } from "express";
import { ENV } from "./env";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { User } from "../../drizzle/schema";
import { ForbiddenError } from "@shared/_core/errors";

const BCRYPT_ROUNDS = 10;

export type SessionPayload = {
  userId: number;
  email: string;
  name: string;
};

function getSecretKey() {
  const secret = ENV.cookieSecret || "fallback-secret-change-in-production";
  return new TextEncoder().encode(secret);
}

/** 生成 JWT Session Token */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const expiresInMs = ONE_YEAR_MS;
  const expirationSeconds = Math.floor((Date.now() + expiresInMs) / 1000);
  return new SignJWT({
    userId: payload.userId,
    email: payload.email,
    name: payload.name,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(getSecretKey());
}

/** 验证 JWT Session Token */
export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    const { userId, email, name } = payload as Record<string, unknown>;
    if (typeof userId !== "number" || typeof email !== "string") return null;
    return { userId: userId as number, email: email as string, name: (name as string) || "" };
  } catch {
    return null;
  }
}

/** 从 Cookie 中获取当前用户 */
export async function authenticateRequest(req: Request): Promise<User> {
  const cookieHeader = req.headers.cookie || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, decodeURIComponent(v.join("="))];
    })
  );
  const token = cookies[COOKIE_NAME];
  const session = await verifySessionToken(token);
  if (!session) throw ForbiddenError("未登录或会话已过期");

  const user = await db.getUserById(session.userId);
  if (!user) throw ForbiddenError("用户不存在");

  return user;
}

/** 注册账号密码相关路由 */
export function registerAuthRoutes(app: Express) {
  // 注册
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    const { email, password, name } = req.body as {
      email?: string;
      password?: string;
      name?: string;
    };

    if (!email || !password) {
      res.status(400).json({ error: "邮箱和密码不能为空" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "密码至少6位" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "邮箱格式不正确" });
      return;
    }

    try {
      // 检查邮箱是否已注册
      const existing = await db.getUserByEmail(email);
      if (existing) {
        res.status(409).json({ error: "该邮箱已注册" });
        return;
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const openId = `email:${email}`; // 兼容旧 openId 字段

      await db.upsertUser({
        openId,
        name: name || email.split("@")[0],
        email,
        passwordHash,
        loginMethod: "email",
        lastSignedIn: new Date(),
      });

      const user = await db.getUserByEmail(email);
      if (!user) throw new Error("创建用户失败");

      const token = await createSessionToken({
        userId: user.id,
        email: user.email!,
        name: user.name || "",
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({
        success: true,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      });
    } catch (err: any) {
      console.error("[Auth] 注册失败:", err);
      res.status(500).json({ error: "注册失败，请重试" });
    }
  });

  // 登录
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      res.status(400).json({ error: "邮箱和密码不能为空" });
      return;
    }

    try {
      const user = await db.getUserByEmail(email);
      if (!user || !user.passwordHash) {
        res.status(401).json({ error: "邮箱或密码错误" });
        return;
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: "邮箱或密码错误" });
        return;
      }

      await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });

      const token = await createSessionToken({
        userId: user.id,
        email: user.email!,
        name: user.name || "",
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({
        success: true,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      });
    } catch (err: any) {
      console.error("[Auth] 登录失败:", err);
      res.status(500).json({ error: "登录失败，请重试" });
    }
  });

  // 登出
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions });
    res.json({ success: true });
  });

  // 获取当前用户信息
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const user = await authenticateRequest(req);
      res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
    } catch {
      res.status(401).json({ error: "未登录" });
    }
  });
}
