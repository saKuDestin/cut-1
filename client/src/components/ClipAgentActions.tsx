/**
 * 切片卡片快捷指令组件
 * 提供快捷按钮（重写标题/换风格/重新生成等）和自定义指令输入
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Wand2, ChevronDown, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

type Clip = {
  id: number;
  title?: string | null;
  copywriting?: string | null;
  hashtags?: string | null;
};

type Props = {
  clip: Clip;
  jobId: number;
  onUpdated: (clipId: number, data: { title: string; copywriting: string; hashtags: string }) => void;
};

const QUICK_ACTIONS = [
  { label: "重写标题", instruction: "rewrite_title", icon: "✏️", desc: "生成更吸引眼球的标题" },
  { label: "重写文案", instruction: "rewrite_copy", icon: "📝", desc: "重新生成带货文案" },
  { label: "重写标签", instruction: "rewrite_hashtags", icon: "#", desc: "优化话题标签" },
  { label: "全部重写", instruction: "rewrite_all", icon: "🔄", desc: "标题+文案+标签全部重新生成" },
] as const;

const STYLE_ACTIONS = [
  { label: "年轻化风格", instruction: "make_younger", icon: "✨", desc: "适合18-25岁，活泼有趣" },
  { label: "高端风格", instruction: "make_luxury", icon: "👑", desc: "优雅大气，突出品质感" },
  { label: "紧迫感", instruction: "make_urgent", icon: "⚡", desc: "限时限量，刺激购买" },
  { label: "加表情", instruction: "add_emoji", icon: "😊", desc: "加入表情符号，更生动" },
  { label: "精简版", instruction: "shorter", icon: "✂️", desc: "去掉冗余，保留核心" },
  { label: "详细版", instruction: "longer", icon: "📖", desc: "扩充内容，增加细节" },
] as const;

type InstructionType =
  | "rewrite_title" | "rewrite_copy" | "rewrite_hashtags" | "rewrite_all"
  | "make_younger" | "make_luxury" | "make_urgent" | "add_emoji"
  | "shorter" | "longer" | "custom";

export default function ClipAgentActions({ clip, jobId, onUpdated }: Props) {
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [customInstruction, setCustomInstruction] = useState("");
  const [loadingInstruction, setLoadingInstruction] = useState<string | null>(null);

  const rewriteMutation = trpc.agent.rewriteClipCopy.useMutation();

  const getBrandPersona = () => localStorage.getItem("livestream_clipper_brand_persona") || undefined;

  const executeInstruction = async (instruction: InstructionType, custom?: string) => {
    setLoadingInstruction(instruction);
    try {
      const result = await rewriteMutation.mutateAsync({
        clipId: clip.id,
        jobId,
        instruction,
        customInstruction: custom,
        brandPersona: getBrandPersona(),
      });

      onUpdated(clip.id, {
        title: result.title,
        copywriting: result.copywriting,
        hashtags: result.hashtags,
      });

      toast.success("文案已更新", {
        description: "AI已根据指令重新生成内容",
      });
    } catch (err) {
      toast.error("指令执行失败", {
        description: "请稍后重试",
      });
    } finally {
      setLoadingInstruction(null);
    }
  };

  const handleCustomSubmit = async () => {
    if (!customInstruction.trim()) return;
    setIsCustomOpen(false);
    await executeInstruction("custom", customInstruction);
    setCustomInstruction("");
  };

  const isAnyLoading = loadingInstruction !== null;

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* 快捷操作按钮 */}
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.instruction}
            onClick={() => executeInstruction(action.instruction)}
            disabled={isAnyLoading}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-white/10 bg-white/5 hover:bg-blue-600/20 hover:border-blue-500/50 text-gray-400 hover:text-blue-300 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            title={action.desc}
          >
            {loadingInstruction === action.instruction ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <span className="text-xs">{action.icon}</span>
            )}
            {action.label}
          </button>
        ))}

        {/* 风格变换下拉 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              disabled={isAnyLoading}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-white/10 bg-white/5 hover:bg-purple-600/20 hover:border-purple-500/50 text-gray-400 hover:text-purple-300 transition-all duration-150 disabled:opacity-50"
            >
              {isAnyLoading && STYLE_ACTIONS.some(a => loadingInstruction === a.instruction) ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              换风格
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="bg-gray-900 border-gray-700 text-gray-200 w-44"
          >
            <DropdownMenuLabel className="text-xs text-gray-500">选择文案风格</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-gray-700" />
            {STYLE_ACTIONS.map((action) => (
              <DropdownMenuItem
                key={action.instruction}
                onClick={() => executeInstruction(action.instruction)}
                className="text-xs hover:bg-gray-800 cursor-pointer"
              >
                <span className="mr-2">{action.icon}</span>
                <div>
                  <p className="font-medium">{action.label}</p>
                  <p className="text-gray-500 text-[10px]">{action.desc}</p>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 自定义指令按钮 */}
        <button
          onClick={() => setIsCustomOpen(true)}
          disabled={isAnyLoading}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-white/10 bg-white/5 hover:bg-yellow-600/20 hover:border-yellow-500/50 text-gray-400 hover:text-yellow-300 transition-all duration-150 disabled:opacity-50"
          title="输入自定义指令"
        >
          <Wand2 className="w-3 h-3" />
          自定义
        </button>
      </div>

      {/* 自定义指令对话框 */}
      <Dialog open={isCustomOpen} onOpenChange={setIsCustomOpen}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-yellow-400" />
              自定义AI指令
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-400">
              用自然语言描述你想要的修改效果，AI会根据你的指令重新生成文案。
            </p>
            <Textarea
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              placeholder="例如：把标题改成更有悬念感的，文案里要提到这件衣服适合梨形身材..."
              className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 min-h-[100px] resize-none"
              autoFocus
            />
            <div className="flex flex-wrap gap-1.5">
              {[
                "适合梨形身材",
                "突出显瘦效果",
                "加入价格锚点",
                "强调面料质感",
                "适合职场穿搭",
              ].map((hint) => (
                <button
                  key={hint}
                  onClick={() => setCustomInstruction((prev) => prev ? `${prev}，${hint}` : hint)}
                  className="text-xs px-2 py-0.5 rounded-full border border-gray-700 hover:border-yellow-500/50 text-gray-500 hover:text-yellow-300 transition-colors"
                >
                  + {hint}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCustomOpen(false)}
              className="border-gray-700 text-gray-400"
            >
              取消
            </Button>
            <Button
              onClick={handleCustomSubmit}
              disabled={!customInstruction.trim()}
              className="bg-yellow-600 hover:bg-yellow-500 text-white"
            >
              <Wand2 className="w-4 h-4 mr-2" />
              执行指令
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
