/**
 * LLM 调用层 - 使用 DeepSeek API
 * 用于产品段落分析、文案生成、Hook 生成等任务
 * 文档：https://platform.deepseek.com/api-docs/
 */
import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type MessageContent = string | TextContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | {
      type: "json_schema";
      json_schema: {
        name: string;
        strict?: boolean;
        schema: Record<string, unknown>;
      };
    };

export type InvokeParams = {
  messages: Message[];
  response_format?: ResponseFormat;
  responseFormat?: ResponseFormat;
  max_tokens?: number;
  temperature?: number;
};

export type InvokeResult = {
  choices: Array<{
    message: {
      content: string | null;
      role: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

function normalizeMessage(message: Message): Record<string, unknown> {
  const { role, name } = message;
  const content = Array.isArray(message.content)
    ? message.content.map((c) => (typeof c === "string" ? c : c.text)).join("\n")
    : typeof message.content === "string"
    ? message.content
    : message.content.text;

  return { role, name, content };
}

/**
 * 调用 DeepSeek API 进行 LLM 推理
 * 替代原 Forge LLM 接口，接口签名保持兼容
 */
export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const apiKey = ENV.deepseekApiKey;
  if (!apiKey) {
    throw new Error("DeepSeek API Key 未配置，请在 .env 中设置 DEEPSEEK_API_KEY");
  }

  const responseFormat = params.responseFormat || params.response_format;

  // DeepSeek 支持 json_object 和 json_schema 格式
  // 但 json_schema 的 strict 模式支持有限，统一降级为 json_object
  let apiResponseFormat: Record<string, unknown> | undefined;
  if (responseFormat) {
    if (responseFormat.type === "json_schema" || responseFormat.type === "json_object") {
      apiResponseFormat = { type: "json_object" };
    } else {
      apiResponseFormat = { type: "text" };
    }
  }

  const payload: Record<string, unknown> = {
    model: "deepseek-chat",
    messages: params.messages.map(normalizeMessage),
    max_tokens: params.max_tokens ?? 2048,
    temperature: params.temperature ?? 0.7,
  };

  if (apiResponseFormat) {
    payload.response_format = apiResponseFormat;
  }

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `DeepSeek API 调用失败: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`
    );
  }

  return (await response.json()) as InvokeResult;
}
