/**
 * 语音转录模块 - 使用 Groq Whisper API
 * Groq 提供极快的 Whisper 推理速度，免费额度充足
 * 文档：https://console.groq.com/docs/speech-text
 *
 * 支持的音频格式：mp3, mp4, mpeg, mpga, m4a, wav, webm
 * 单文件大小限制：25MB
 */
import { ENV } from "./env";

export type TranscribeOptions = {
  audioUrl: string;   // 音频文件的 URL（S3 预签名 URL）
  language?: string;  // 可选：语言代码，如 "zh"、"en"
  prompt?: string;    // 可选：提示词，帮助提高转录准确率
};

// Whisper API 分段格式
export type WhisperSegment = {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
};

// Whisper API 返回格式
export type WhisperResponse = {
  task: "transcribe";
  language: string;
  duration: number;
  text: string;
  segments: WhisperSegment[];
};

export type TranscriptionResponse = WhisperResponse;

export type TranscriptionError = {
  error: string;
  code: "FILE_TOO_LARGE" | "INVALID_FORMAT" | "TRANSCRIPTION_FAILED" | "UPLOAD_FAILED" | "SERVICE_ERROR";
  details?: string;
};

const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
// Groq Whisper 单文件限制 25MB
const MAX_SIZE_MB = 25;

/**
 * 使用 Groq Whisper API 转录音频
 */
export async function transcribeAudio(
  options: TranscribeOptions
): Promise<TranscriptionResponse | TranscriptionError> {
  try {
    // 检查 API Key 配置
    if (!ENV.groqApiKey) {
      return {
        error: "Groq API Key 未配置",
        code: "SERVICE_ERROR",
        details: "请在 .env 中设置 GROQ_API_KEY",
      };
    }

    // 从 URL 下载音频文件
    let audioBuffer: Buffer;
    let mimeType: string;
    try {
      const response = await fetch(options.audioUrl);
      if (!response.ok) {
        return {
          error: "无法下载音频文件",
          code: "INVALID_FORMAT",
          details: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      audioBuffer = Buffer.from(await response.arrayBuffer());
      mimeType = response.headers.get("content-type") || "audio/mpeg";

      const sizeMB = audioBuffer.length / (1024 * 1024);
      if (sizeMB > MAX_SIZE_MB) {
        return {
          error: "音频文件超过大小限制",
          code: "FILE_TOO_LARGE",
          details: `文件大小 ${sizeMB.toFixed(2)}MB，Groq Whisper 限制 ${MAX_SIZE_MB}MB`,
        };
      }
    } catch (error) {
      return {
        error: "下载音频文件失败",
        code: "SERVICE_ERROR",
        details: error instanceof Error ? error.message : "未知错误",
      };
    }

    // 构建 FormData
    const formData = new FormData();
    const filename = `audio.${getFileExtension(mimeType)}`;
    const audioBlob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
    formData.append("file", audioBlob, filename);

    // 使用 Groq 的 whisper-large-v3-turbo 模型（速度快、效果好）
    formData.append("model", "whisper-large-v3-turbo");
    formData.append("response_format", "verbose_json");

    // 语言提示（中文直播设置为 zh 可显著提升准确率）
    if (options.language) {
      formData.append("language", options.language);
    } else {
      // 默认中文，适合直播场景
      formData.append("language", "zh");
    }

    if (options.prompt) {
      formData.append("prompt", options.prompt);
    } else {
      // 默认提示词，帮助 Whisper 识别电商直播常用词
      formData.append(
        "prompt",
        "这是一段电商直播视频，主播正在介绍服装产品，包括款式、材质、价格、优惠等内容。"
      );
    }

    // 调用 Groq Whisper API
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.groqApiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        error: "Groq Whisper 转录失败",
        code: "TRANSCRIPTION_FAILED",
        details: `${response.status} ${response.statusText}${errorText ? `: ${errorText}` : ""}`,
      };
    }

    const whisperResponse = (await response.json()) as WhisperResponse;

    if (!whisperResponse.text || typeof whisperResponse.text !== "string") {
      return {
        error: "转录结果格式异常",
        code: "SERVICE_ERROR",
        details: "Groq Whisper 返回了无效的响应格式",
      };
    }

    return whisperResponse;
  } catch (error) {
    return {
      error: "语音转录失败",
      code: "SERVICE_ERROR",
      details: error instanceof Error ? error.message : "未知错误",
    };
  }
}

/**
 * 根据 MIME 类型获取文件扩展名
 */
function getFileExtension(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "audio/webm": "webm",
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/ogg": "ogg",
    "audio/m4a": "m4a",
    "audio/mp4": "m4a",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mp4",
  };
  return mimeToExt[mimeType] || "mp3";
}
