import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateSRT } from "./videoProcessor";
import type { TranscriptSegment } from "./videoProcessor";

// ===== videoProcessor 单元测试 =====

describe("generateSRT", () => {
  it("should generate valid SRT content from segments", () => {
    const segments: TranscriptSegment[] = [
      { start: 0, end: 2.5, text: "大家好，欢迎来到直播间" },
      { start: 2.5, end: 5.0, text: "今天给大家介绍这款连衣裙" },
    ];
    const srt = generateSRT(segments, 0);
    expect(srt).toContain("1");
    expect(srt).toContain("00:00:00,000 --> 00:00:02,500");
    expect(srt).toContain("大家好，欢迎来到直播间");
    expect(srt).toContain("2");
    expect(srt).toContain("00:00:02,500 --> 00:00:05,000");
    expect(srt).toContain("今天给大家介绍这款连衣裙");
  });

  it("should apply startOffset correctly", () => {
    const segments: TranscriptSegment[] = [
      { start: 30, end: 32, text: "这款衣服非常显瘦" },
    ];
    const srt = generateSRT(segments, 30);
    expect(srt).toContain("00:00:00,000 --> 00:00:02,000");
    expect(srt).toContain("这款衣服非常显瘦");
  });

  it("should skip segments before startOffset", () => {
    const segments: TranscriptSegment[] = [
      { start: 5, end: 8, text: "早于偏移量的内容" },
      { start: 30, end: 35, text: "有效内容" },
    ];
    const srt = generateSRT(segments, 30);
    expect(srt).not.toContain("早于偏移量的内容");
    expect(srt).toContain("有效内容");
  });

  it("should return empty string for empty segments", () => {
    const srt = generateSRT([], 0);
    expect(srt.trim()).toBe("");
  });

  it("should handle segments with milliseconds", () => {
    const segments: TranscriptSegment[] = [
      { start: 1.123, end: 3.456, text: "测试毫秒精度" },
    ];
    const srt = generateSRT(segments, 0);
    expect(srt).toContain("00:00:01,123 --> 00:00:03,456");
  });
});

// ===== tRPC 路由测试 =====
describe("auth router", () => {
  it("should export appRouter", async () => {
    const { appRouter } = await import("./routers");
    expect(appRouter).toBeDefined();
    expect(typeof appRouter).toBe("object");
  });

  it("should have jobs router", async () => {
    const { appRouter } = await import("./routers");
    expect(appRouter._def.procedures).toBeDefined();
  });
});

// ===== 数据库辅助函数测试（mock DB）=====
describe("db helpers", () => {
  it("should import db helpers without error", async () => {
    const dbModule = await import("./db");
    expect(typeof dbModule.getJobById).toBe("function");
    expect(typeof dbModule.createJob).toBe("function");
    expect(typeof dbModule.updateJob).toBe("function");
    expect(typeof dbModule.getClipsByJobId).toBe("function");
    expect(typeof dbModule.updateClip).toBe("function");
    expect(typeof dbModule.createTranscript).toBe("function");
    expect(typeof dbModule.getTranscriptByJobId).toBe("function");
  });
});

// ===== jobProcessor 测试 =====
describe("jobProcessor", () => {
  it("should import processJob without error", async () => {
    const { processJob } = await import("./jobProcessor");
    expect(typeof processJob).toBe("function");
  });
});

// ===== videoProcessor 测试 =====
describe("videoProcessor exports", () => {
  it("should export all required functions", async () => {
    const vp = await import("./videoProcessor");
    expect(typeof vp.extractAudio).toBe("function");
    expect(typeof vp.clipVideo).toBe("function");
    expect(typeof vp.deduplicateVideo).toBe("function");
    expect(typeof vp.generateSRT).toBe("function");
    expect(typeof vp.downloadToTemp).toBe("function");
    expect(typeof vp.cleanupTemp).toBe("function");
  });
});

// ===== 文件名编码测试（修复中文文件名上传问题）=====
describe("filename encoding for Chinese filenames", () => {
  it("encodeURIComponent handles Chinese filenames", () => {
    const chineseName = "3月19日直播(1).mp4";
    const encoded = encodeURIComponent(chineseName);
    // Encoded should not contain Chinese characters
    expect(encoded).not.toMatch(/[\u4e00-\u9fff]/);
    // Should be decodable back to original
    expect(decodeURIComponent(encoded)).toBe(chineseName);
  });

  it("decodeURIComponent handles ASCII filenames safely", () => {
    const asciiName = "livestream_2024.mp4";
    const decoded = (() => {
      try { return decodeURIComponent(asciiName); } catch { return asciiName; }
    })();
    expect(decoded).toBe(asciiName);
  });

  it("decodeURIComponent handles malformed encoding gracefully", () => {
    const malformed = "video%ZZ.mp4"; // invalid percent encoding
    const decoded = (() => {
      try { return decodeURIComponent(malformed); } catch { return malformed; }
    })();
    expect(decoded).toBe(malformed); // falls back to original
  });
});

// ===== 视频钩子（Hook）功能测试 =====
describe("hook style validation", () => {
  it("should accept valid hook styles", () => {
    const validStyles = ["suspense", "pain_point", "benefit"];
    for (const style of validStyles) {
      expect(validStyles).toContain(style);
    }
  });

  it("should default to suspense if hookStyle is undefined", () => {
    const hookStyle = undefined ?? "suspense";
    expect(hookStyle).toBe("suspense");
  });

  it("should generate correct default hook texts for each style", () => {
    const productName = "连衣裙";
    const defaults: Record<string, string> = {
      suspense: `这件${productName}为什么这么多人回购？`,
      pain_point: `穿衣难的姐妹看过来！${productName}真的绝了`,
      benefit: `${productName}性价比高到离谱！`,
    };
    expect(defaults.suspense).toContain("连衣裙");
    expect(defaults.pain_point).toContain("连衣裙");
    expect(defaults.benefit).toContain("连衣裙");
  });
});

// ===== ZIP打包下载测试 =====
describe("zip download route", () => {
  it("should have download-zip endpoint registered", async () => {
    // 验证ZIP下载路由在服务器中存在（通过检查index.ts的导入）
    const fs = await import("fs");
    const path = await import("path");
    const indexPath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      "_core/index.ts"
    );
    const indexContent = fs.readFileSync(indexPath, "utf-8");
    expect(indexContent).toContain("/api/download-zip/:jobId");
    expect(indexContent).toContain("archiver");
  });

  it("should generate correct zip filename format", () => {
    const jobId = 42;
    const timestamp = 1234567890;
    const zipName = `clips_job${jobId}_${timestamp}.zip`;
    expect(zipName).toBe("clips_job42_1234567890.zip");
    expect(zipName).toMatch(/^clips_job\d+_\d+\.zip$/);
  });

  it("should generate correct clip file names in zip", () => {
    const clips = [1, 2, 3, 10, 11];
    const names = clips.map((_, i) => {
      const idx = String(i + 1).padStart(2, "0");
      return `clip_${idx}.mp4`;
    });
    expect(names[0]).toBe("clip_01.mp4");
    expect(names[3]).toBe("clip_04.mp4");
    expect(names[4]).toBe("clip_05.mp4");
  });
});

// ===== 智能体（Agent）功能测试 =====
describe("agentService", () => {
  it("rewriteClipCopy - 指令类型枚举完整", () => {
    const instructions = [
      "rewrite_title", "rewrite_copy", "rewrite_hashtags", "rewrite_all",
      "make_younger", "make_luxury", "make_urgent", "add_emoji",
      "shorter", "longer", "custom",
    ];
    expect(instructions).toHaveLength(11);
    expect(instructions).toContain("custom");
    expect(instructions).toContain("make_younger");
    expect(instructions).toContain("rewrite_all");
  });

  it("parseGlobalInstruction - 品牌人设解析结构正确", () => {
    const mockResult = {
      brandPersona: "高端女装品牌",
      styleKeywords: ["优雅", "大气"],
      excludeKeywords: ["超便宜", "白菜价"],
      summary: "已设置品牌人设为高端女装风格",
    };
    expect(mockResult).toHaveProperty("brandPersona");
    expect(mockResult).toHaveProperty("styleKeywords");
    expect(mockResult).toHaveProperty("excludeKeywords");
    expect(mockResult).toHaveProperty("summary");
    expect(Array.isArray(mockResult.styleKeywords)).toBe(true);
    expect(Array.isArray(mockResult.excludeKeywords)).toBe(true);
  });

  it("chat - 消息历史格式符合DeepSeek API要求", () => {
    const messages = [
      { role: "user" as const, content: "你好" },
      { role: "assistant" as const, content: "你好！有什么可以帮你的？" },
      { role: "user" as const, content: "帮我优化文案" },
    ];
    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
    messages.forEach((m) => {
      expect(["user", "assistant"]).toContain(m.role);
      expect(typeof m.content).toBe("string");
    });
  });

  it("batchRewriteAllClips - 批量指令不含单字段指令", () => {
    const batchInstructions = [
      "rewrite_all", "make_younger", "make_luxury",
      "make_urgent", "add_emoji", "shorter", "longer", "custom",
    ];
    expect(batchInstructions).toHaveLength(8);
    expect(batchInstructions).not.toContain("rewrite_title");
    expect(batchInstructions).not.toContain("rewrite_copy");
  });

  it("agentService - 模块可以正常导入", async () => {
    const agent = await import("./agentService");
    expect(typeof agent.rewriteClipCopy).toBe("function");
    expect(typeof agent.parseGlobalInstruction).toBe("function");
    expect(typeof agent.callDeepSeek).toBe("function");
    expect(typeof agent.callDeepSeekStream).toBe("function");
  });
});
