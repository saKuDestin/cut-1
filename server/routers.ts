import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { storagePut } from "./storage";
import {
  createJob,
  getJobById,
  getJobsByUserId,
  updateJob,
  getClipsByJobId,
  updateClip,
  getTranscriptByJobId,
  softDeleteJob,
  resetJobForRetry,
  updateUserBrandPersona,
  getUserById,
} from "./db";
import { processJob } from "./jobProcessor";
import { enqueueJob } from "./jobQueue";
import {
  rewriteClipCopy,
  parseGlobalInstruction,
  callDeepSeek,
  type AgentMessage,
} from "./agentService";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ===== 上传视频 =====
  jobs: router({
    getUploadUrl: protectedProcedure
      .input(
        z.object({
          fileName: z.string(),
          fileSize: z.number(),
          productName: z.string().optional(),
          productKeywords: z.string().optional(),
          hookStyle: z.enum(["suspense", "pain_point", "benefit"]).optional(),
          globalPrompt: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const ext = input.fileName.split(".").pop() || "mp4";
        const key = `uploads/${ctx.user.id}/${Date.now()}.${ext}`;

        const job = await createJob({
          userId: ctx.user.id,
          title: input.fileName,
          productName: input.productName || "",
          productKeywords: input.productKeywords || "",
          hookStyle: input.hookStyle || "suspense",
          globalPrompt: input.globalPrompt || "",
          originalVideoKey: key,
          originalFileName: input.fileName,
          originalFileSizeMb: input.fileSize / (1024 * 1024),
          status: "uploading",
          progress: 0,
        });

        return { jobId: job.id, uploadKey: key };
      }),

    confirmUpload: protectedProcedure
      .input(
        z.object({
          jobId: z.number(),
          videoUrl: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const job = await getJobById(input.jobId);
        if (!job || job.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "任务不存在" });
        }

        await updateJob(input.jobId, {
          originalVideoUrl: input.videoUrl,
          status: "transcribing",
          progress: 5,
        });

        enqueueJob(input.jobId, processJob).catch((err) => {
          console.error(`[Job ${input.jobId}] 处理失败:`, err);
          updateJob(input.jobId, {
            status: "failed",
            errorMessage: err.message,
          });
        });

        return { success: true, jobId: input.jobId };
      }),

    getStatus: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ input, ctx }) => {
        const job = await getJobById(input.jobId);
        if (!job || job.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "任务不存在" });
        }
        return job;
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      const allJobs = await getJobsByUserId(ctx.user.id);
      // 过滤掉软删除的任务
      return allJobs.filter((j) => !(j as any).deletedAt);
    }),

    getClips: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ input, ctx }) => {
        const job = await getJobById(input.jobId);
        if (!job || job.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "任务不存在" });
        }
        return getClipsByJobId(input.jobId);
      }),

    getTranscript: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ input, ctx }) => {
        const job = await getJobById(input.jobId);
        if (!job || job.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "任务不存在" });
        }
        return getTranscriptByJobId(input.jobId);
      }),

    updateClipCopy: protectedProcedure
      .input(
        z.object({
          clipId: z.number(),
          title: z.string().optional(),
          copywriting: z.string().optional(),
          hashtags: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { clipId, ...data } = input;
        await updateClip(clipId, data);
        return { success: true };
      }),

    /**
     * 软删除任务
     */
    deleteJob: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const job = await getJobById(input.jobId);
        if (!job || job.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "任务不存在" });
        }
        // 处理中的任务不允许删除
        if (!["completed", "failed"].includes(job.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "处理中的任务不能删除，请等待完成后再删除" });
        }
        await softDeleteJob(input.jobId);
        return { success: true };
      }),

    /**
     * 重试失败的任务
     */
    retryJob: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const job = await getJobById(input.jobId);
        if (!job || job.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "任务不存在" });
        }
        if (job.status !== "failed") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "只有失败的任务才能重试" });
        }
        if (!job.originalVideoUrl) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "原始视频不存在，无法重试" });
        }

        await resetJobForRetry(input.jobId);

        enqueueJob(input.jobId, processJob).catch((err) => {
          console.error(`[Job ${input.jobId}] 重试失败:`, err);
          updateJob(input.jobId, {
            status: "failed",
            errorMessage: err.message,
          });
        });

        return { success: true };
      }),
  }),

  // ===== 存储 =====
  storage: router({
    getUploadUrl: protectedProcedure
      .input(
        z.object({
          fileName: z.string(),
          contentType: z.string(),
          jobId: z.number(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const ext = input.fileName.split(".").pop() || "mp4";
        const key = `uploads/${ctx.user.id}/${input.jobId}/video.${ext}`;
        return { key, uploadPath: `/api/upload/${input.jobId}` };
      }),
  }),

  // ===== 智能体（Agent）=====
  agent: router({
    /**
     * 重写切片文案（快捷指令 + 自定义指令）
     */
    rewriteClipCopy: protectedProcedure
      .input(
        z.object({
          clipId: z.number(),
          jobId: z.number(),
          instruction: z.enum([
            "rewrite_title",
            "rewrite_copy",
            "rewrite_hashtags",
            "rewrite_all",
            "make_younger",
            "make_luxury",
            "make_urgent",
            "add_emoji",
            "shorter",
            "longer",
            "custom",
          ]),
          customInstruction: z.string().optional(),
          brandPersona: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const job = await getJobById(input.jobId);
        if (!job || job.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "任务不存在" });
        }

        const clips = await getClipsByJobId(input.jobId);
        const clip = clips.find((c) => c.id === input.clipId);
        if (!clip) {
          throw new TRPCError({ code: "NOT_FOUND", message: "切片不存在" });
        }

        // 优先使用传入的 brandPersona，其次从数据库读取用户设置
        let brandPersona = input.brandPersona;
        if (!brandPersona) {
          const user = await getUserById(ctx.user.id);
          brandPersona = user?.brandPersona || undefined;
        }

        const result = await rewriteClipCopy({
          currentTitle: clip.title || "",
          currentCopy: clip.copywriting || "",
          currentHashtags: clip.hashtags || "",
          productName: job.productName || "",
          productKeywords: job.productKeywords || "",
          instruction: input.instruction,
          customInstruction: input.customInstruction,
          brandPersona,
        });

        await updateClip(input.clipId, {
          title: result.title,
          copywriting: result.copywriting,
          hashtags: result.hashtags,
        });

        return { success: true, ...result };
      }),

    /**
     * 批量重写某个任务的所有切片文案
     */
    batchRewriteAllClips: protectedProcedure
      .input(
        z.object({
          jobId: z.number(),
          instruction: z.enum([
            "rewrite_all",
            "make_younger",
            "make_luxury",
            "make_urgent",
            "add_emoji",
            "shorter",
            "longer",
            "custom",
          ]),
          customInstruction: z.string().optional(),
          brandPersona: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const job = await getJobById(input.jobId);
        if (!job || job.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "任务不存在" });
        }

        // 优先使用传入的 brandPersona，其次从数据库读取
        let brandPersona = input.brandPersona;
        if (!brandPersona) {
          const user = await getUserById(ctx.user.id);
          brandPersona = user?.brandPersona || undefined;
        }

        const clips = await getClipsByJobId(input.jobId);
        const completedClips = clips.filter((c) => c.status === "completed");
        let successCount = 0;

        for (const clip of completedClips) {
          try {
            const result = await rewriteClipCopy({
              currentTitle: clip.title || "",
              currentCopy: clip.copywriting || "",
              currentHashtags: clip.hashtags || "",
              productName: job.productName || "",
              productKeywords: job.productKeywords || "",
              instruction: input.instruction,
              customInstruction: input.customInstruction,
              brandPersona,
            });

            await updateClip(clip.id, {
              title: result.title,
              copywriting: result.copywriting,
              hashtags: result.hashtags,
            });
            successCount++;
          } catch (err) {
            console.error(`[Agent] 切片 ${clip.id} 重写失败:`, err);
          }
        }

        return { success: true, successCount, totalCount: completedClips.length };
      }),

    /**
     * 解析全局指令并持久化品牌人设到数据库
     */
    parseGlobalInstruction: protectedProcedure
      .input(z.object({ message: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const result = await parseGlobalInstruction(input.message);

        // 持久化品牌人设到数据库
        if (result.brandPersona) {
          await updateUserBrandPersona(ctx.user.id, {
            brandPersona: result.brandPersona,
            styleKeywords: result.styleKeywords,
            excludeKeywords: result.excludeKeywords,
          });
        }

        return result;
      }),

    /**
     * 获取用户的品牌人设（从数据库读取，跨设备同步）
     */
    getBrandPersona: protectedProcedure.query(async ({ ctx }) => {
      const user = await getUserById(ctx.user.id);
      return {
        brandPersona: user?.brandPersona || "",
        styleKeywords: (user?.styleKeywords as string[]) || [],
        excludeKeywords: (user?.excludeKeywords as string[]) || [],
      };
    }),

    /**
     * 清除品牌人设
     */
    clearBrandPersona: protectedProcedure.mutation(async ({ ctx }) => {
      await updateUserBrandPersona(ctx.user.id, {
        brandPersona: "",
        styleKeywords: [],
        excludeKeywords: [],
      });
      return { success: true };
    }),

    /**
     * 通用AI对话（非流式，tRPC mutation）
     */
    chat: protectedProcedure
      .input(
        z.object({
          messages: z.array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            })
          ),
          brandPersona: z.string().optional(),
          jobContext: z
            .object({
              productName: z.string().optional(),
              productKeywords: z.string().optional(),
              clipCount: z.number().optional(),
            })
            .optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { messages, brandPersona: inputPersona, jobContext } = input;

        // 优先使用传入的，其次从数据库读取
        let brandPersona = inputPersona;
        if (!brandPersona) {
          const user = await getUserById(ctx.user.id);
          brandPersona = user?.brandPersona || undefined;
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

        const agentMessages: AgentMessage[] = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const reply = await callDeepSeek(agentMessages, systemPrompt, 1200);
        return { reply };
      }),
  }),
});

export type AppRouter = typeof appRouter;
