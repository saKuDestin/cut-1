/**
 * AI 智能体悬浮对话框（v2.0）
 * - 右下角悬浮按钮，点击展开侧边对话面板
 * - 使用 SSE 流式输出，AI 回复实时逐字显示
 * - 品牌人设持久化到数据库，跨设备同步
 * - 支持上下文感知（当前任务信息）
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot,
  X,
  Send,
  Minimize2,
  Maximize2,
  Sparkles,
  User,
  Settings,
  ChevronDown,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  streaming?: boolean;
};

type JobContext = {
  productName?: string;
  productKeywords?: string;
  clipCount?: number;
};

type Props = {
  jobContext?: JobContext;
  onBrandPersonaChange?: (persona: string) => void;
};

const CHAT_HISTORY_KEY = "livestream_clipper_chat_history";

const QUICK_PROMPTS = [
  { label: "设置品牌风格", text: "我的品牌定位是高端女装，文案要优雅大气，不要使用超便宜、白菜价等词语" },
  { label: "年轻化风格", text: "帮我把所有文案改成更年轻化的风格，适合18-25岁的女生，可以用一些流行语" },
  { label: "突出性价比", text: "我想突出产品的性价比，文案要让人觉得物超所值" },
  { label: "如何使用工具", text: "怎么使用快捷指令批量修改所有切片的文案风格？" },
];

export default function AgentChatPanel({ jobContext, onBrandPersonaChange }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem(CHAT_HISTORY_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.map((m: Message) => ({ ...m, timestamp: new Date(m.timestamp) }));
      }
    } catch {}
    return [
      {
        id: "welcome",
        role: "assistant",
        content: "你好！我是你的AI助手\n\n我可以帮你：\n- 设置品牌人设（如高端女装，优雅风格）\n- 添加限定词（如禁止使用低价词汇）\n- 批量调整文案风格\n- 回答短视频运营问题\n\n直接告诉我你的需求吧！",
        timestamp: new Date(),
      },
    ];
  });
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [brandPersona, setBrandPersona] = useState<string>("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const parseGlobalMutation = trpc.agent.parseGlobalInstruction.useMutation();
  const clearBrandPersonaMutation = trpc.agent.clearBrandPersona.useMutation();

  // 从数据库加载品牌人设
  const { data: brandPersonaData } = trpc.agent.getBrandPersona.useQuery();
  useEffect(() => {
    if (brandPersonaData?.brandPersona) {
      setBrandPersona(brandPersonaData.brandPersona);
      onBrandPersonaChange?.(brandPersonaData.brandPersona);
    }
  }, [brandPersonaData]);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // 持久化聊天历史（最多保留20条）
  useEffect(() => {
    const toSave = messages.filter((m) => !m.streaming).slice(-20);
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(toSave));
  }, [messages]);

  const addMessage = useCallback((role: "user" | "assistant", content: string, streaming = false): string => {
    const id = `${Date.now()}-${Math.random()}`;
    setMessages((prev) => [
      ...prev,
      { id, role, content, timestamp: new Date(), streaming },
    ]);
    return id;
  }, []);

  const updateStreamingMessage = useCallback((id: string, content: string, done = false) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, content, streaming: !done } : m
      )
    );
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput("");
    addMessage("user", text);
    setIsLoading(true);

    try {
      // 检测是否是品牌人设/限定词设置类指令
      const isSettingInstruction =
        text.includes("品牌") ||
        text.includes("风格") ||
        text.includes("禁止") ||
        text.includes("限定") ||
        text.includes("人设") ||
        text.includes("定位");

      if (isSettingInstruction) {
        // 解析全局指令并持久化到数据库
        const parsed = await parseGlobalMutation.mutateAsync({ message: text });

        if (parsed.brandPersona) {
          setBrandPersona(parsed.brandPersona);
          onBrandPersonaChange?.(parsed.brandPersona);
        }

        const styleStr = parsed.styleKeywords.length > 0 ? `\n• 风格词：${parsed.styleKeywords.join("、")}` : "";
        const excludeStr = parsed.excludeKeywords.length > 0 ? `\n• 禁用词：${parsed.excludeKeywords.join("、")}` : "";
        addMessage(
          "assistant",
          `✅ ${parsed.summary}\n\n**已保存的品牌设置：**\n• 人设：${parsed.brandPersona || "通用"}${styleStr}${excludeStr}\n\n_设置已同步到云端，换设备也能使用。_`
        );
      } else {
        // 使用 SSE 流式对话
        const streamMsgId = addMessage("assistant", "", true);

        const historyMessages = messages
          .filter((m) => m.id !== "welcome" && !m.streaming)
          .slice(-8)
          .map((m) => ({ role: m.role, content: m.content }));

        historyMessages.push({ role: "user", content: text });

        abortControllerRef.current = new AbortController();

        const response = await fetch("/api/agent/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            messages: historyMessages,
            brandPersona: brandPersona || undefined,
            jobContext: jobContext
              ? {
                  productName: jobContext.productName,
                  productKeywords: jobContext.productKeywords,
                  clipCount: jobContext.clipCount,
                }
              : undefined,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error("AI助手请求失败");
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("无法读取响应流");

        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;

            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.error) {
                throw new Error(data.error);
              }
              if (data.done) {
                updateStreamingMessage(streamMsgId, accumulated, true);
                break;
              }
              if (data.content) {
                accumulated += data.content;
                updateStreamingMessage(streamMsgId, accumulated, false);
              }
            } catch (parseErr) {
              // 忽略解析错误
            }
          }
        }

        // 确保最终状态正确
        if (accumulated) {
          updateStreamingMessage(streamMsgId, accumulated, true);
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      addMessage("assistant", "抱歉，AI助手暂时无法响应，请稍后再试。");
      toast.error("AI助手请求失败");
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickPrompt = (text: string) => {
    setInput(text);
    inputRef.current?.focus();
  };

  const handleClearBrandPersona = async () => {
    try {
      await clearBrandPersonaMutation.mutateAsync();
      setBrandPersona("");
      onBrandPersonaChange?.("");
      toast.success("品牌人设已清除");
    } catch {
      toast.error("清除失败，请重试");
    }
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: "聊天记录已清除。有什么可以帮你的？",
        timestamp: new Date(),
      },
    ]);
    localStorage.removeItem(CHAT_HISTORY_KEY);
    toast.success("聊天记录已清除");
  };

  const panelWidth = isExpanded ? "w-[480px]" : "w-[360px]";
  const panelHeight = isExpanded ? "h-[600px]" : "h-[480px]";

  return (
    <>
      {/* 悬浮按钮 */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-2xl shadow-blue-900/50 transition-all duration-200 hover:scale-105"
        >
          <Bot className="w-5 h-5" />
          <span className="text-sm font-medium">AI助手</span>
          {brandPersona && (
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" title="品牌人设已设置" />
          )}
        </button>
      )}

      {/* 对话面板 */}
      {isOpen && (
        <div
          className={`fixed bottom-6 right-6 z-50 ${panelWidth} ${panelHeight} flex flex-col rounded-2xl border border-white/10 bg-gray-900/95 backdrop-blur-xl shadow-2xl shadow-black/50 transition-all duration-200`}
        >
          {/* 头部 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 rounded-t-2xl bg-gradient-to-r from-blue-900/40 to-purple-900/40">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">AI 智能助手</p>
                <p className="text-xs text-gray-400">DeepSeek · 流式输出</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {brandPersona && (
                <Badge variant="outline" className="text-xs border-green-500/50 text-green-400 hidden sm:flex">
                  <Sparkles className="w-3 h-3 mr-1" />
                  人设已设置
                </Badge>
              )}
              <button
                onClick={handleClearHistory}
                className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                title="清除聊天记录"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              >
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 品牌人设状态栏 */}
          {brandPersona && (
            <div className="flex items-center justify-between px-4 py-2 bg-green-900/20 border-b border-green-500/20">
              <div className="flex items-center gap-2 min-w-0">
                <Settings className="w-3.5 h-3.5 text-green-400 shrink-0" />
                <span className="text-xs text-green-300 truncate">{brandPersona}</span>
              </div>
              <button
                onClick={handleClearBrandPersona}
                className="text-xs text-gray-500 hover:text-red-400 transition-colors shrink-0 ml-2"
              >
                清除
              </button>
            </div>
          )}

          {/* 消息列表 */}
          <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef as any}>
            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      msg.role === "user" ? "bg-blue-600" : "bg-purple-700"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <User className="w-3.5 h-3.5 text-white" />
                    ) : (
                      <Bot className="w-3.5 h-3.5 text-white" />
                    )}
                  </div>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white rounded-tr-sm"
                        : "bg-gray-800 text-gray-100 rounded-tl-sm"
                    }`}
                  >
                    {msg.content ? (
                      msg.content.split("\n").map((line, i) => {
                        const parts = line.split(/\*\*(.*?)\*\*/g);
                        return (
                          <p key={i} className={i > 0 ? "mt-1" : ""}>
                            {parts.map((part, j) =>
                              j % 2 === 1 ? (
                                <strong key={j} className="font-semibold">
                                  {part}
                                </strong>
                              ) : (
                                part
                              )
                            )}
                          </p>
                        );
                      })
                    ) : (
                      <span className="text-gray-500 italic text-xs">思考中...</span>
                    )}
                    {msg.streaming && (
                      <span className="inline-block w-1.5 h-4 bg-gray-400 ml-0.5 animate-pulse rounded-sm" />
                    )}
                  </div>
                </div>
              ))}

              {isLoading && !messages.some((m) => m.streaming) && (
                <div className="flex gap-2">
                  <div className="w-7 h-7 rounded-full bg-purple-700 flex items-center justify-center shrink-0">
                    <Bot className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex gap-1 items-center">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* 快捷提示词 */}
          {messages.length <= 2 && (
            <div className="px-4 pb-2">
              <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                <ChevronDown className="w-3 h-3" />
                快捷指令
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PROMPTS.map((qp) => (
                  <button
                    key={qp.label}
                    onClick={() => handleQuickPrompt(qp.text)}
                    className="text-xs px-2.5 py-1 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
                  >
                    {qp.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 输入区 */}
          <div className="px-4 pb-4 pt-2 border-t border-white/10">
            <div className="flex gap-2 items-end">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入指令，如：设置高端女装风格..."
                className="flex-1 min-h-[40px] max-h-[120px] resize-none bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 text-sm rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                rows={1}
                disabled={isLoading}
              />
              {isLoading ? (
                <Button
                  onClick={handleStop}
                  size="sm"
                  className="h-10 w-10 p-0 rounded-xl bg-red-600 hover:bg-red-500 shrink-0"
                  title="停止生成"
                >
                  <X className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  size="sm"
                  className="h-10 w-10 p-0 rounded-xl bg-blue-600 hover:bg-blue-500 shrink-0"
                >
                  <Send className="w-4 h-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-gray-600 mt-1.5 text-center">
              Enter 发送 · Shift+Enter 换行{isLoading ? " · 点击红色按钮停止" : ""}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
