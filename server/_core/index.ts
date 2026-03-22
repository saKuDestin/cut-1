import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { ENV } from "./env";
import { updateJob, getJobById, getClipsByJobId } from "../db";
import { processJob } from "../jobProcessor";
import archiver from "archiver";
import { sdk } from "./sdk";
import FormData from "form-data";
import fetch from "node-fetch";

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

  // 增加超时时间（大文件上传需要）
  server.timeout = 30 * 60 * 1000; // 30分钟
  server.keepAliveTimeout = 30 * 60 * 1000;

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  registerOAuthRoutes(app);

  // ===== 视频上传接口（流式上传到S3，不缓冲到内存）=====
  app.post("/api/upload/:jobId", async (req, res) => {
    // 设置超时
    req.setTimeout(30 * 60 * 1000);
    res.setTimeout(30 * 60 * 1000);

    try {
      const jobId = parseInt(req.params.jobId);
      if (isNaN(jobId)) {
        res.status(400).json({ error: "Invalid jobId" });
        return;
      }

      // 验证用户session
      let user = null;
      try { user = await sdk.authenticateRequest(req as any); } catch {}
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
      // 解码URI编码的文件名（前端使用encodeURIComponent避免中文字符问题）
      const rawFileName = (req.headers["x-file-name"] as string) || "video.mp4";
      const fileName = (() => { try { return decodeURIComponent(rawFileName); } catch { return rawFileName; } })();
      const ext = fileName.split(".").pop()?.toLowerCase() || "mp4";
      const key = `uploads/${user.id}/${jobId}/video.${ext}`;

      const forgeBaseUrl = ENV.forgeApiUrl.replace(/\/+$/, "");
      const forgeApiKey = ENV.forgeApiKey;
      const uploadUrl = `${forgeBaseUrl}/v1/storage/upload?path=${encodeURIComponent(key)}`;

      // 使用form-data流式转发（不缓冲到内存）
      const form = new FormData();
      form.append("file", req, {
        filename: fileName,
        contentType: contentType,
        knownLength: req.headers["content-length"]
          ? parseInt(req.headers["content-length"])
          : undefined,
      });

      console.log(`[Upload] Job ${jobId}: 开始流式上传到S3, key=${key}`);

      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${forgeApiKey}`,
          ...form.getHeaders(),
        },
        body: form,
        // @ts-ignore
        timeout: 25 * 60 * 1000, // 25分钟超时
      });

      if (!uploadResponse.ok) {
        const errText = await uploadResponse.text();
        console.error(`[Upload] S3上传失败: ${uploadResponse.status} ${errText}`);
        res.status(500).json({ error: `上传失败: ${errText}` });
        return;
      }

      const uploadResult = await uploadResponse.json() as { url: string };
      const videoUrl = uploadResult.url;

      console.log(`[Upload] Job ${jobId}: 上传成功, url=${videoUrl}`);

      await updateJob(jobId, {
        originalVideoUrl: videoUrl,
        originalVideoKey: key,
        status: "transcribing",
        progress: 5,
      });

      // 异步启动处理（不等待）
      processJob(jobId).catch((err) => {
        console.error(`[Job ${jobId}] 处理失败:`, err);
        updateJob(jobId, { status: "failed", errorMessage: err.message });
      });

      res.json({ success: true, videoUrl, jobId });
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

      // 验证用户session
      let user = null;
      try { user = await sdk.authenticateRequest(req as any); } catch {}
      if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

      const job = await getJobById(jobId);
      if (!job || job.userId !== user.id) { res.status(404).json({ error: "Job not found" }); return; }

      const clips = await getClipsByJobId(jobId);
      const completedClips = clips.filter((c) => c.status === "completed" && c.videoUrl);

      if (completedClips.length === 0) {
        res.status(400).json({ error: "没有已完成的切片" }); return;
      }

      // 设置响应头
      const zipName = `clips_job${jobId}_${Date.now()}.zip`;
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

      // 创建ZIP流
      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.pipe(res);

      // 生成文案汇总TXT
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

      // 并行下载所有视频和字幕并加入ZIP
      const { default: nodeFetch } = await import("node-fetch");
      await Promise.all(
        completedClips.map(async (clip, i) => {
          const idx = String(i + 1).padStart(2, "0");
          try {
            // 视频文件
            if (clip.videoUrl) {
              const vRes = await nodeFetch(clip.videoUrl);
              if (vRes.ok && vRes.body) {
                archive.append(vRes.body as any, { name: `clip_${idx}.mp4` });
              }
            }
            // 字幕文件
            if (clip.srtUrl) {
              const sRes = await nodeFetch(clip.srtUrl);
              if (sRes.ok && sRes.body) {
                archive.append(sRes.body as any, { name: `clip_${idx}.srt` });
              }
            }
            // 单个切片文案TXT
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
