/**
 * DeepSeek 智能体服务
 * 提供：流式对话、文案重写、全局指令解析、快捷指令执行
 */
import { ENV } from "./_core/env";

const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

export type AgentMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type RewriteInstruction =
  | "rewrite_title"       // 重写标题
  | "rewrite_copy"        // 重写文案
  | "rewrite_hashtags"    // 重写话题标签
  | "rewrite_all"         // 全部重写
  | "make_younger"        // 更年轻化
  | "make_luxury"         // 更高端
  | "make_urgent"         // 更紧迫感
  | "add_emoji"           // 加表情
  | "shorter"             // 更简短
  | "longer"              // 更详细
  | "custom";             // 自定义指令

// 系统提示词：电商带货专家人设
const BASE_SYSTEM_PROMPT = `你是一位专业的电商直播带货文案专家，擅长为服装类产品创作抖音爆款短视频文案。

你的能力包括：
1. 根据产品特点生成吸引人的标题（15字以内，带数字或疑问句效果更好）
2. 创作符合抖音风格的带货文案（200字以内，有节奏感，突出卖点）
3. 生成精准的话题标签（5-8个，混合热门和精准标签）
4. 理解商家的品牌定位和风格偏好，并在文案中体现
5. 根据用户的自然语言指令灵活调整文案风格

注意事项：
- 不使用"最"、"第一"等绝对化用语
- 文案要真实可信，不夸大产品效果
- 标签要与产品强相关，不堆砌无关热词
- 根据用户设置的品牌人设和限定词来调整输出风格`;

/**
 * 调用DeepSeek API（非流式，用于文案重写等短任务）
 */
export async function callDeepSeek(
  messages: AgentMessage[],
  systemPrompt?: string,
  maxTokens = 800
): Promise<string> {
  const apiKey = ENV.deepseekApiKey;
  if (!apiKey) throw new Error("DeepSeek API Key 未配置");

  const allMessages: AgentMessage[] = [
    { role: "system", content: systemPrompt || BASE_SYSTEM_PROMPT },
    ...messages,
  ];

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: allMessages,
      max_tokens: maxTokens,
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek API 错误: ${response.status} ${err}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content?.trim() || "";
}

/**
 * 流式调用DeepSeek API（用于对话，返回AsyncGenerator）
 */
export async function* callDeepSeekStream(
  messages: AgentMessage[],
  systemPrompt?: string
): AsyncGenerator<string> {
  const apiKey = ENV.deepseekApiKey;
  if (!apiKey) throw new Error("DeepSeek API Key 未配置");

  const allMessages: AgentMessage[] = [
    { role: "system", content: systemPrompt || BASE_SYSTEM_PROMPT },
    ...messages,
  ];

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: allMessages,
      max_tokens: 1500,
      temperature: 0.8,
      stream: true,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek API 错误: ${response.status} ${err}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("无法读取响应流");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (!trimmed.startsWith("data: ")) continue;

      try {
        const json = JSON.parse(trimmed.slice(6));
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // 忽略解析错误
      }
    }
  }
}

/**
 * 重写切片文案（根据指令类型和自定义提示词）
 */
export async function rewriteClipCopy(params: {
  currentTitle: string;
  currentCopy: string;
  currentHashtags: string;
  productName: string;
  productKeywords: string;
  instruction: RewriteInstruction;
  customInstruction?: string;
  brandPersona?: string; // 品牌人设（全局设置）
}): Promise<{ title: string; copywriting: string; hashtags: string }> {
  const {
    currentTitle,
    currentCopy,
    currentHashtags,
    productName,
    productKeywords,
    instruction,
    customInstruction,
    brandPersona,
  } = params;

  const instructionMap: Record<RewriteInstruction, string> = {
    rewrite_title: "只重写标题，保持文案和标签不变。标题要更吸引眼球，15字以内。",
    rewrite_copy: "只重写带货文案，保持标题和标签不变。文案要更有感染力。",
    rewrite_hashtags: "只重新生成话题标签，保持标题和文案不变。标签要更精准有效。",
    rewrite_all: "全部重新生成：标题、文案、标签，保持整体风格统一。",
    make_younger: "将文案风格改为更年轻化、更活泼，适合18-25岁女性，可以使用网络流行语。",
    make_luxury: "将文案风格改为更高端、更优雅，突出品质感，适合25-40岁追求品质的女性。",
    make_urgent: "增加紧迫感和稀缺感，如限时、限量、今天最后等，刺激立即购买。",
    add_emoji: "在文案中适当加入表情符号，让内容更生动活泼。",
    shorter: "将文案精简，保留核心卖点，去掉冗余内容。",
    longer: "扩充文案内容，增加更多产品细节描述和使用场景。",
    custom: customInstruction || "按照用户要求优化文案。",
  };

  const systemPrompt = brandPersona
    ? `${BASE_SYSTEM_PROMPT}\n\n【品牌人设/限定词】：${brandPersona}`
    : BASE_SYSTEM_PROMPT;

  const userPrompt = `请根据以下要求优化这个短视频的文案：

【操作指令】：${instructionMap[instruction]}

【当前内容】：
- 标题：${currentTitle || "（无）"}
- 文案：${currentCopy || "（无）"}
- 标签：${currentHashtags || "（无）"}

【产品信息】：
- 产品名称：${productName || "服装"}
- 核心卖点：${productKeywords || "时尚、高品质"}

请严格按照以下JSON格式返回（不要有其他内容）：
{
  "title": "新标题",
  "copywriting": "新文案",
  "hashtags": "#标签1 #标签2 #标签3"
}`;

  const result = await callDeepSeek(
    [{ role: "user", content: userPrompt }],
    systemPrompt,
    1000
  );

  try {
    // 提取JSON（处理可能的markdown代码块包裹）
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("返回格式错误");
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      title: parsed.title || currentTitle,
      copywriting: parsed.copywriting || currentCopy,
      hashtags: parsed.hashtags || currentHashtags,
    };
  } catch {
    // 解析失败时返回原内容
    console.error("[Agent] 文案重写解析失败:", result);
    return {
      title: currentTitle,
      copywriting: currentCopy,
      hashtags: currentHashtags,
    };
  }
}

/**
 * 解析用户的全局指令，提取品牌人设、限定词等结构化信息
 */
export async function parseGlobalInstruction(userMessage: string): Promise<{
  brandPersona: string;
  styleKeywords: string[];
  excludeKeywords: string[];
  summary: string;
}> {
  const prompt = `用户发来了一条关于品牌风格或内容限定的指令，请提取关键信息并返回JSON：

用户指令：${userMessage}

请返回JSON格式：
{
  "brandPersona": "品牌人设描述（一句话）",
  "styleKeywords": ["风格关键词1", "风格关键词2"],
  "excludeKeywords": ["禁止使用的词1", "禁止使用的词2"],
  "summary": "对用户指令的简短确认回复（给用户看的，友好自然）"
}`;

  const result = await callDeepSeek(
    [{ role: "user", content: prompt }],
    "你是一个帮助分析电商品牌风格偏好的AI助手，善于从用户描述中提取结构化信息。",
    500
  );

  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("解析失败");
    return JSON.parse(jsonMatch[0]);
  } catch {
    return {
      brandPersona: userMessage,
      styleKeywords: [],
      excludeKeywords: [],
      summary: "已记录您的品牌偏好设置，后续文案生成将按此风格调整。",
    };
  }
}
