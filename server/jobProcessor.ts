import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import { transcribeAudio } from "./_core/voiceTranscription";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import {
  updateJob,
  createTranscript,
  createClip,
  updateClip,
  getJobById,
} from "./db";
import {
  extractAudio,
  clipVideo,
  deduplicateVideo,
  generateSRT,
  downloadToTemp,
  cleanupTemp,
  addHookTextToVideo,
  TranscriptSegment,
  ProductSegment,
} from "./videoProcessor";

// 主任务处理入口
export async function processJob(jobId: number): Promise<void> {
  const job = await getJobById(jobId);
  if (!job || !job.originalVideoUrl) {
    await updateJob(jobId, { status: "failed", errorMessage: "任务或视频URL不存在" });
    return;
  }

  const tempFiles: string[] = [];

  try {
    // === 阶段1：下载视频 ===
    await updateJob(jobId, { status: "transcribing", progress: 5 });
    console.log(`[Job ${jobId}] 下载视频: ${job.originalVideoUrl}`);
    const videoPath = await downloadToTemp(job.originalVideoUrl, "mp4");
    tempFiles.push(videoPath);

    // === 阶段2：提取音频 ===
    await updateJob(jobId, { progress: 10 });
    console.log(`[Job ${jobId}] 提取音频...`);
    const audioPath = await extractAudio(videoPath);
    tempFiles.push(audioPath);

    // === 阶段3：Whisper语音转录 ===
    await updateJob(jobId, { progress: 15 });
    console.log(`[Job ${jobId}] Whisper转录中...`);
    const audioUrl = await uploadTempFileToS3(audioPath, `jobs/${jobId}/audio.mp3`, "audio/mpeg");
    tempFiles.push(audioPath);

    const transcriptResult = await transcribeAudio({
      audioUrl,
      language: "zh",
      prompt: "这是一段服装直播带货视频，主播在介绍服装产品的款式、材质、价格和穿搭建议",
    });

    if ('error' in transcriptResult) {
      throw new Error(`转录失败: ${transcriptResult.error}`);
    }

    const segments: TranscriptSegment[] = (transcriptResult.segments || []).map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text,
    }));

    await createTranscript({
      jobId,
      fullText: transcriptResult.text,
      segments: segments as any,
      language: transcriptResult.language || "zh",
    });

    await updateJob(jobId, { status: "analyzing", progress: 35 });

    // === 阶段4：LLM智能分段分析 ===
    console.log(`[Job ${jobId}] LLM分析产品段落...`);
    const productSegments = await analyzeProductSegments(
      segments,
      job.productName || "",
      job.productKeywords || ""
    );

    await updateJob(jobId, { status: "clipping", progress: 50, totalClips: productSegments.length });

    // === 阶段5：切片 + 去重 + 文案生成 ===
    console.log(`[Job ${jobId}] 开始切片，共 ${productSegments.length} 个片段`);

    for (let i = 0; i < productSegments.length; i++) {
      const seg = productSegments[i];
      const clipProgress = 50 + Math.floor(((i + 1) / productSegments.length) * 45);

      // 创建clip记录
      const clip = await createClip({
        jobId,
        clipIndex: i,
        startTime: seg.startTime,
        endTime: seg.endTime,
        duration: seg.endTime - seg.startTime,
        productSegment: seg.productDescription,
        status: "clipping",
      });

      try {
        const clipTempPath = path.join(os.tmpdir(), `clip_${uuidv4()}.mp4`);
        const dedupTempPath = path.join(os.tmpdir(), `dedup_${uuidv4()}.mp4`);
        tempFiles.push(clipTempPath, dedupTempPath);

        // 切片
        await clipVideo(videoPath, seg.startTime, seg.endTime, clipTempPath);
        await updateClip(clip.id, { status: "deduplicating" });

        // 去重处理（随机化参数，每个切片不同）
        const dedupOptions = {
          cropScale: 1.02 + Math.random() * 0.02,
          brightness: 0.01 + Math.random() * 0.02,
          contrast: 1.01 + Math.random() * 0.02,
          saturation: 1.01 + Math.random() * 0.02,
          speedFactor: 1.01 + Math.random() * 0.015,
          mirror: false,
        };
        await deduplicateVideo(clipTempPath, dedupTempPath, dedupOptions);
        await updateClip(clip.id, { status: "generating_copy" });

        // LLM生成带货文案 + Hook文案
        const copyData = await generateCopywriting(
          seg.productDescription,
          seg.keyPoints,
          job.productName || "",
          job.productKeywords || ""
        );

        // 生成Hook文案
        const hookStyle = (job as any).hookStyle || "suspense";
        const hookText = await generateHookText(
          seg.productDescription,
          seg.keyPoints,
          job.productName || "",
          hookStyle
        );

        // 将Hook文字叠加到去重后的视频开头
        const hookTempPath = path.join(os.tmpdir(), `hook_${uuidv4()}.mp4`);
        tempFiles.push(hookTempPath);
        try {
          await addHookTextToVideo(dedupTempPath, hookTempPath, hookText, 4);
        } catch (hookErr) {
          console.warn(`[Job ${jobId}] Hook叠加失败，使用去重视频:`, hookErr);
          // 如果Hook叠加失败，使用去重视频作为备用
          await fs.copyFile(dedupTempPath, hookTempPath);
        }

        // 上传带Hook的视频到S3
        const videoBuffer = await fs.readFile(hookTempPath);
        const videoKey = `jobs/${jobId}/clips/clip_${i + 1}_${uuidv4().slice(0, 8)}.mp4`;
        const { url: videoUrl } = await storagePut(videoKey, videoBuffer, "video/mp4");

        // 生成SRT字幕
        const clipSegments = segments.filter(
          (s) => s.start >= seg.startTime - 0.5 && s.end <= seg.endTime + 0.5
        );
        const srtContent = generateSRT(clipSegments, seg.startTime);
        const srtBuffer = Buffer.from(srtContent, "utf-8");
        const srtKey = `jobs/${jobId}/clips/clip_${i + 1}_${uuidv4().slice(0, 8)}.srt`;
        const { url: srtUrl } = await storagePut(srtKey, srtBuffer, "text/plain");

        await updateClip(clip.id, {
          videoUrl,
          videoKey,
          srtUrl,
          srtKey,
          srtContent,
          title: copyData.title,
          copywriting: copyData.copywriting,
          hashtags: copyData.hashtags,
          hookText,
          status: "completed",
        });

        await updateJob(jobId, { progress: clipProgress });
      } catch (clipErr: any) {
        console.error(`[Job ${jobId}] 切片 ${i} 处理失败:`, clipErr);
        await updateClip(clip.id, { status: "failed" });
      }
    }

    await updateJob(jobId, { status: "completed", progress: 100 });
    console.log(`[Job ${jobId}] 处理完成！`);
  } catch (err: any) {
    console.error(`[Job ${jobId}] 处理失败:`, err);
    await updateJob(jobId, { status: "failed", errorMessage: err.message || "处理失败" });
  } finally {
    await cleanupTemp(tempFiles);
  }
}

// 上传临时文件到S3
async function uploadTempFileToS3(filePath: string, key: string, contentType: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const { url } = await storagePut(key, buffer, contentType);
  return url;
}

// LLM分析产品讲解段落
async function analyzeProductSegments(
  segments: TranscriptSegment[],
  productName: string,
  productKeywords: string
): Promise<ProductSegment[]> {
  if (segments.length === 0) return [];

  // 将转录文本格式化为带时间戳的文本
  const transcriptText = segments
    .map((s) => `[${s.start.toFixed(1)}s-${s.end.toFixed(1)}s] ${s.text}`)
    .join("\n");

  const prompt = `你是一个专业的电商直播视频剪辑助手。以下是一段服装直播的转录文本（带时间戳）。

产品名称：${productName || "服装产品"}
关键词/卖点：${productKeywords || "款式、材质、价格、穿搭"}

转录文本：
${transcriptText}

请分析这段转录文本，识别出所有主播在重点介绍某款产品的段落（每段15秒到60秒为宜），并以JSON格式返回。

要求：
1. 每个段落必须是主播在集中介绍某款产品特点、卖点、价格或穿搭的内容
2. 时间段长度在15-60秒之间
3. 避免切割在句子中间
4. 如果一款产品介绍超过60秒，拆分为多个片段
5. 过滤掉闲聊、互动、非产品内容的片段

返回格式（严格JSON）：
{
  "segments": [
    {
      "startTime": 10.5,
      "endTime": 45.2,
      "productDescription": "主播介绍的产品概述（1-2句话）",
      "keyPoints": ["卖点1", "卖点2", "卖点3"]
    }
  ]
}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "你是专业的电商直播视频剪辑助手，擅长识别产品讲解段落并提取卖点。" },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "product_segments",
          strict: true,
          schema: {
            type: "object",
            properties: {
              segments: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    startTime: { type: "number" },
                    endTime: { type: "number" },
                    productDescription: { type: "string" },
                    keyPoints: { type: "array", items: { type: "string" } },
                  },
                  required: ["startTime", "endTime", "productDescription", "keyPoints"],
                  additionalProperties: false,
                },
              },
            },
            required: ["segments"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices?.[0]?.message?.content;
    const content = typeof rawContent === 'string' ? rawContent : null;
    if (!content) return getFallbackSegments(segments);
    const parsed = JSON.parse(content);
    return parsed.segments || getFallbackSegments(segments);
  } catch (err) {
    console.error("[LLM] 分段分析失败，使用备用方案:", err);
    return getFallbackSegments(segments);
  }
}

// 备用分段方案（按固定时长切割）
function getFallbackSegments(segments: TranscriptSegment[]): ProductSegment[] {
  if (segments.length === 0) return [];
  const totalDuration = segments[segments.length - 1].end;
  const clipDuration = 45; // 45秒一段
  const result: ProductSegment[] = [];

  for (let start = 0; start < totalDuration; start += clipDuration) {
    const end = Math.min(start + clipDuration, totalDuration);
    if (end - start < 15) break;
    const segsInRange = segments.filter((s) => s.start >= start && s.end <= end);
    result.push({
      startTime: start,
      endTime: end,
      productDescription: segsInRange.map((s) => s.text).join(" ").slice(0, 100),
      keyPoints: [],
    });
  }
  return result;
}

// LLM生成带货文案
async function generateCopywriting(
  productDescription: string,
  keyPoints: string[],
  productName: string,
  productKeywords: string
): Promise<{ title: string; copywriting: string; hashtags: string }> {
  const prompt = `你是一个专业的抖音电商带货文案写手，擅长写爆款短视频标题和带货文案。

产品名称：${productName || "服装"}
产品描述：${productDescription}
核心卖点：${keyPoints.join("、") || productKeywords || "时尚、高品质"}

请为这个短视频切片生成：
1. 一个吸引人的抖音标题（20字以内，带数字或感叹词效果更好）
2. 一段带货文案（100-150字，突出卖点，引导购买）
3. 5-8个相关话题标签（#开头）

注意：
- 标题要有钩子，引发好奇或共鸣
- 文案要口语化，符合抖音风格
- 避免使用"最"、"第一"等绝对化用语
- 话题标签要与服装、穿搭相关

返回JSON格式：
{
  "title": "标题",
  "copywriting": "带货文案",
  "hashtags": "#标签1 #标签2 #标签3"
}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "你是专业的抖音电商带货文案写手。" },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "copywriting",
          strict: true,
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              copywriting: { type: "string" },
              hashtags: { type: "string" },
            },
            required: ["title", "copywriting", "hashtags"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices?.[0]?.message?.content;
    const content = typeof rawContent === 'string' ? rawContent : null;
    if (!content) return getDefaultCopy(productName);
    return JSON.parse(content);
  } catch (err) {
    console.error("[LLM] 文案生成失败:", err);
    return getDefaultCopy(productName);
  }
}

function getDefaultCopy(productName: string) {
  return {
    title: `${productName || "这件衣服"}真的绝了！`,
    copywriting: `今天给大家分享这款超好看的${productName || "服装"}，款式时尚，穿上立刻显瘦显高！面料舒适透气，不挑身材，姐妹们赶快来看看！`,
    hashtags: "#穿搭分享 #今日穿搭 #服装推荐 #时尚穿搭 #抖音好物",
  };
}

// LLM生成视频钩子文案
async function generateHookText(
  productDescription: string,
  keyPoints: string[],
  productName: string,
  hookStyle: string
): Promise<string> {
  const styleGuide: Record<string, string> = {
    suspense: "悬念式：用疑问或反转制造好奇心，让人想继续看。例如：'这件衣服我穿上直接被问了10次在哪买？'",
    pain_point: "痛点式：直击用户痛点，引发共鸣。例如：'胯宽腿粗的姐妹看过来！这条裤子真的救了我！'",
    benefit: "利益式：直接说出核心好处，刺激购买欲。例如：'199元穿出千元质感，这件外套绝了！'",
  };

  const guide = styleGuide[hookStyle] || styleGuide.suspense;

  const prompt = `你是抖音爆款短视频文案专家。请为以下产品视频生成一句开场钩子文案。

产品名称：${productName || "服装"}
产品描述：${productDescription}
核心卖点：${keyPoints.join("、") || "时尚、高品质"}
钩子风格：${guide}

要求：
1. 只输出一句话，不超过20个字
2. 必须让人在前3秒就想继续看
3. 不要使用"最"、"第一"等绝对化用语
4. 直接输出钩子文案，不要任何解释

钩子文案：`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "你是抖音爆款短视频文案专家，擅长写让人停不下来的开场钩子。" },
        { role: "user", content: prompt },
      ],
    });
    const rawContent = response.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent.trim() : null;
    if (!content) return getDefaultHook(productName, hookStyle);
    // 清理多余标点和引号
    return content.replace(/^["'「」【】]|["'「」【】]$/g, "").trim().slice(0, 30);
  } catch (err) {
    console.error("[LLM] Hook文案生成失败:", err);
    return getDefaultHook(productName, hookStyle);
  }
}

function getDefaultHook(productName: string, hookStyle: string): string {
  const defaults: Record<string, string> = {
    suspense: `这件${productName || "衣服"}为什么这么多人回购？`,
    pain_point: `穿衣难的姐妹看过来！${productName || "这件"}真的绝了`,
    benefit: `${productName || "这件衣服"}性价比高到离谱！`,
  };
  return defaults[hookStyle] || defaults.suspense;
}
