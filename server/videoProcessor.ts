import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface ProductSegment {
  startTime: number;
  endTime: number;
  productDescription: string;
  keyPoints: string[];
}

// 从视频中提取音频（mp3格式，用于Whisper）
export async function extractAudio(videoPath: string): Promise<string> {
  const audioPath = path.join(os.tmpdir(), `audio_${uuidv4()}.mp3`);
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate("128k")
      .audioChannels(1)
      .audioFrequency(16000)
      .output(audioPath)
      .on("end", () => resolve(audioPath))
      .on("error", reject)
      .run();
  });
}

// 获取视频时长（秒）
export async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration ?? 0);
    });
  });
}

// 切片视频（从原始视频中截取指定时间段）
export async function clipVideo(
  videoPath: string,
  startTime: number,
  endTime: number,
  outputPath: string
): Promise<void> {
  const duration = endTime - startTime;
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .videoCodec("libx264")
      .audioCodec("aac")
      .outputOptions(["-preset fast", "-crf 23", "-movflags +faststart"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}

// 深度去重处理（规避抖音重复内容检测）
export async function deduplicateVideo(
  inputPath: string,
  outputPath: string,
  options: {
    cropScale?: number;      // 裁剪缩放比例 (1.02-1.05)
    brightness?: number;     // 亮度调整 (-0.05 to 0.05)
    contrast?: number;       // 对比度 (0.95-1.05)
    saturation?: number;     // 饱和度 (0.95-1.05)
    speedFactor?: number;    // 播放速度 (1.01-1.03)
    mirror?: boolean;        // 水平镜像
    bgmPath?: string;        // 背景音乐路径
    bgmVolume?: number;      // BGM音量 (0.05-0.15)
  } = {}
): Promise<void> {
  const {
    cropScale = 1.03,
    brightness = 0.02,
    contrast = 1.02,
    saturation = 1.02,
    speedFactor = 1.02,
    mirror = false,
    bgmVolume = 0.08,
  } = options;

  // 构建视频滤镜链
  const vFilters: string[] = [];

  // 1. 微缩放（改变画面像素排列）
  vFilters.push(`scale=iw*${cropScale}:ih*${cropScale}`);
  // 2. 裁剪回原始尺寸（居中裁剪）
  vFilters.push(`crop=iw/${cropScale}:ih/${cropScale}`);
  // 3. 水平镜像（可选）
  if (mirror) vFilters.push("hflip");
  // 4. 色彩调整（亮度/对比度/饱和度）
  vFilters.push(`eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`);
  // 5. 轻微噪点（改变像素特征）
  vFilters.push("noise=alls=2:allf=t+u");

  // 构建音频滤镜（变速）
  const aFilters: string[] = [`atempo=${speedFactor}`];

  // 视频变速
  const videoSpeedFilter = `setpts=${(1 / speedFactor).toFixed(4)}*PTS`;
  vFilters.push(videoSpeedFilter);

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(inputPath)
      .videoFilters(vFilters)
      .audioFilters(aFilters)
      .videoCodec("libx264")
      .audioCodec("aac")
      .outputOptions(["-preset fast", "-crf 23", "-movflags +faststart"])
      .output(outputPath);

    cmd.on("end", () => resolve()).on("error", reject).run();
  });
}

// 生成SRT字幕文件内容
export function generateSRT(segments: TranscriptSegment[], startOffset: number = 0): string {
  const lines: string[] = [];
  let index = 1;

  for (const seg of segments) {
    const adjustedStart = seg.start - startOffset;
    const adjustedEnd = seg.end - startOffset;
    if (adjustedStart < 0 || adjustedEnd < 0) continue;

    lines.push(String(index));
    lines.push(`${formatSRTTime(adjustedStart)} --> ${formatSRTTime(adjustedEnd)}`);
    lines.push(seg.text.trim());
    lines.push("");
    index++;
  }

  return lines.join("\n");
}

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

// 下载远程文件到临时目录
export async function downloadToTemp(url: string, ext: string = "mp4"): Promise<string> {
  const { default: fetch } = await import("node-fetch");
  const tmpPath = path.join(os.tmpdir(), `video_${uuidv4()}.${ext}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download: ${response.statusText}`);
  const buffer = await response.arrayBuffer();
  await fs.writeFile(tmpPath, Buffer.from(buffer));
  return tmpPath;
}

// 将钩子文字叠加到视频开头（使用drawtext滤镜）
export async function addHookTextToVideo(
  inputPath: string,
  outputPath: string,
  hookText: string,
  hookDurationSec: number = 4
): Promise<void> {
  // 将文本按长度分行（每行最多12个字）
  const maxCharsPerLine = 12;
  const lines: string[] = [];
  for (let i = 0; i < hookText.length; i += maxCharsPerLine) {
    lines.push(hookText.slice(i, i + maxCharsPerLine));
  }

  // 构建多行drawtext滤镜（每行垂直偏移）
  const lineHeight = 60;
  const totalTextHeight = lines.length * lineHeight;
  const drawtextFilters = lines.map((line, idx) => {
    const yOffset = `(h/2-${Math.floor(totalTextHeight / 2)}+${idx * lineHeight})`;
    // 转义特殊字符
    const escapedLine = line
      .replace(/\\/g, '\\\\')
      .replace(/:/g, '\\:')
      .replace(/'/g, "\\\\'");
    return [
      `drawtext=text='${escapedLine}'`,
      `fontsize=48`,
      `fontcolor=white`,
      `borderw=3`,
      `bordercolor=black`,
      `x=(w-text_w)/2`,
      `y=${yOffset}`,
      `enable='between(t,0,${hookDurationSec})'`,
    ].join(':');
  });

  // 添加半透明黑色背景遮罩（仅在hook时段）
  const overlayFilter = `drawbox=x=0:y=ih/2-${Math.floor(totalTextHeight / 2) + 20}:w=iw:h=${totalTextHeight + 40}:color=black@0.55:t=fill:enable='between(t,0,${hookDurationSec})'`;

  const vf = [overlayFilter, ...drawtextFilters].join(',');

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters(vf)
      .videoCodec('libx264')
      .audioCodec('copy')
      .outputOptions(['-preset fast', '-crf 23', '-movflags +faststart'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

// 清理临时文件
export async function cleanupTemp(filePaths: string[]): Promise<void> {
  for (const fp of filePaths) {
    try { await fs.unlink(fp); } catch {}
  }
}
