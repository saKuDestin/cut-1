import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerAuthRoutes, authenticateRequest } from "./auth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { updateJob, getJobById, getClipsByJobId, getUserById } from "../db";
import { processJob } from "../jobProcessor";
import { enqueueJob, getActiveJobCount, getWaitingQueueLength } from "../jobQueue";
import { callDeepSeekStream } from "../agentService";
import { storagePut } from "../storage";
import archiver from "archiver";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => { server.close(() => resolve(true)); });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  server.timeout = 30 * 60 * 1000;
  server.keepAliveTimeout = 30 * 60 * 1000;

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  // 注册账号密码认证路由（注册/登录/登出/me）
  registerAuthRoutes(app);

  // ===== 视频上传接口（流式上传到 AWS S3）=====
  app.post("/api/upload/:jobId", async (req, res) => {
    req.setTimeout(30 * 60 * 1000);
    res.setTimeout(30 * 60 * 1000);

    try {
      const jobId = parseInt(req.params.jobId);
      if (isNaN(jobId)) {
        res.status(400).json({ error: "Invalid jobId" });
        return;
      }

      let user = null;
      try { user = await authenticateRequest(req as any); } catch {}
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const job = await getJobById(jobId);
      if (!job || job.userId !== user.id) {
        res.status(404).json({ error: "Job not found" });
        return;
      }

      const contentType = (req.headers["content-type"] as string)?.split(";")[0] || "video/mp4";
      const rawFileName = (req.headers["x-file-name"] as string) || "video.mp4";
      const fileName = (() => { try { return decodeURIComponent(rawFileName); } catch { return rawFileName; } })();
      const ext = fileName.split(".").pop()?.toLowerCase() || "mp4";
      const key = `uploads/${user.id}/${jobId}/video.${ext}`;

      console.log(`[Upload] Job ${jobId}: 开始接收视频流, key=${key}`);

      // 将请求体读取为 Buffer 后上传到 S3
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", resolve);
        req.on("error", reject);
      });

      const videoBuffer = Buffer.concat(chunks);
      console.log(`[Upload] Job ${jobId}: 接收完成 ${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB，上传到S3...`);

      await storagePut(key, videoBuffer, contentType);

      console.log(`[Upload] Job ${jobId}: S3上传成功`);

      // 只保存稳定的 key，不写入带签名的临时 URL（presigned URL 过长且会过期）
      await updateJob(jobId, {
        originalVideoKey: key,
        originalVideoUrl: null,
        status: "transcribing",
        progress: 5,
      });

      // 通过队列控制并发
      enqueueJob(jobId, processJob).catch((err) => {
        console.error(`[Job ${jobId}] 处理失败:`, err);
        updateJob(jobId, { status: "failed", errorMessage: err.message });
      });

      res.json({ success: true, jobId });
    } catch (err: any) {
      console.error("[Upload] 上传异常:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || "上传失败" });
      }
    }
  });

  // ===== ZIP批量打包下载接口 =====
  app.get("/api/download-zip/:jobId", async (req, res) => {
    try {
      const jobId = parseInt(req.params.jobId);
      if (isNaN(jobId)) { res.status(400).json({ error: "Invalid jobId" }); return; }

      let user = null;
      try { user = await authenticateRequest(req as any); } catch {}
      if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

      const job = await getJobById(jobId);
      if (!job || job.userId !== user.id) { res.status(404).json({ error: "Job not found" }); return; }

      const clips = await getClipsByJobId(jobId);
      const completedClips = clips.filter((c) => c.status === "completed" && c.videoUrl);

      if (completedClips.length === 0) {
        res.status(400).json({ error: "没有已完成的切片" }); return;
      }

      const zipName = `clips_job${jobId}_${Date.now()}.zip`;
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.pipe(res);

      const copyText = completedClips
        .map((c, i) => [
          `===== 切片 ${i + 1} =====`,
          `标题：${c.title || ""}`,
          `文案：${c.copywriting || ""}`,
          `标签：${c.hashtags || ""}`,
          `钩子：${(c as any).hookText || ""}`,
          `时间段：${c.startTime.toFixed(1)}s - ${c.endTime.toFixed(1)}s`,
          "",
        ].join("\n"))
        .join("\n");
      archive.append(Buffer.from(copyText, "utf-8"), { name: "all_copywriting.txt" });

      const { default: nodeFetch } = await import("node-fetch");
      await Promise.all(
        completedClips.map(async (clip, i) => {
          const idx = String(i + 1).padStart(2, "0");
          try {
            if (clip.videoUrl) {
              const vRes = await nodeFetch(clip.videoUrl);
              if (vRes.ok && vRes.body) {
                archive.append(vRes.body as any, { name: `clip_${idx}.mp4` });
              }
            }
            if (clip.srtUrl) {
              const sRes = await nodeFetch(clip.srtUrl);
              if (sRes.ok && sRes.body) {
                archive.append(sRes.body as any, { name: `clip_${idx}.srt` });
              }
            }
            const singleCopy = [
              `标题：${clip.title || ""}`,
              `文案：${clip.copywriting || ""}`,
              `标签：${clip.hashtags || ""}`,
              `钩子：${(clip as any).hookText || ""}`,
            ].join("\n");
            archive.append(Buffer.from(singleCopy, "utf-8"), { name: `clip_${idx}_copy.txt` });
          } catch (e) {
            console.warn(`[ZIP] 切片 ${i + 1} 下载失败:`, e);
          }
        })
      );

      await archive.finalize();
    } catch (err: any) {
      console.error("[ZIP] 打包失败:", err);
      if (!res.headersSent) res.status(500).json({ error: err.message || "打包失败" });
    }
  });

  // ===== SSE 流式 AI 对话接口 =====
  app.post("/api/agent/chat/stream", async (req, res) => {
    try {
      let user = null;
      try { user = await authenticateRequest(req as any); } catch {}
      if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

      const { messages, brandPersona: inputPersona, jobContext } = req.body as {
        messages: Array<{ role: "user" | "assistant"; content: string }>;
        brandPersona?: string;
        jobContext?: { productName?: string; productKeywords?: string; clipCount?: number };
      };

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: "messages 不能为空" });
        return;
      }

      // 优先使用传入的，其次从数据库读取
      let brandPersona = inputPersona;
      if (!brandPersona) {
        const dbUser = await getUserById(user.id);
        brandPersona = dbUser?.brandPersona || undefined;
      }

      let systemPrompt = `你是直播切片大师的AI助手，专门帮助电商服装商家优化短视频内容。

你可以帮助用户：
1. 设置品牌人设和文案风格偏好
2. 解释如何使用各种功能
3. 根据用户描述，给出具体的文案优化建议
4. 分析产品卖点，提供内容策略建议
5. 回答关于短视频运营的问题`;

      if (brandPersona) {
        systemPrompt += `\n\n【当前品牌人设】：${brandPersona}`;
      }

      if (jobContext) {
        systemPrompt += `\n\n【当前任务信息】：产品：${jobContext.productName || "服装"}，卖点：${jobContext.productKeywords || "未设置"}，切片数量：${jobContext.clipCount ?? 0}个`;
      }

      // 设置 SSE 响应头
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const agentMessages = messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      try {
        for await (const chunk of callDeepSeekStream(agentMessages, systemPrompt)) {
          if (res.writableEnded) break;
          res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        }
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
        }
      } catch (streamErr: any) {
        console.error("[SSE] 流式对话失败:", streamErr);
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ error: streamErr.message || "AI响应失败" })}\n\n`);
          res.end();
        }
      }
    } catch (err: any) {
      console.error("[SSE] 接口异常:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || "服务器错误" });
      }
    }
  });

  // ===== 队列状态查询接口 =====
  app.get("/api/queue/status", async (req, res) => {
    let user = null;
    try { user = await authenticateRequest(req as any); } catch {}
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    res.json({
      activeJobs: getActiveJobCount(),
      waitingJobs: getWaitingQueueLength(),
      maxConcurrent: 2,
    });
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({ router: appRouter, createContext })
  );

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) console.log(`Port ${preferredPort} is busy, using port ${port} instead`);

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
