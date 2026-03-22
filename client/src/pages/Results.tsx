import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Download,
  Edit2,
  Check,
  X,
  Play,
  FileText,
  Hash,
  Scissors,
  ArrowLeft,
  Package,
  Copy,
  ChevronDown,
  ChevronUp,
  Zap,
  Archive,
  Loader2,
  Bot,
  Wand2,
} from "lucide-react";
import ClipAgentActions from "@/components/ClipAgentActions";
import AgentChatPanel from "@/components/AgentChatPanel";

type Clip = {
  id: number;
  clipIndex: number;
  startTime: number;
  endTime: number;
  duration: number;
  videoUrl: string | null;
  srtUrl: string | null;
  srtContent: string | null;
  title: string | null;
  copywriting: string | null;
  hashtags: string | null;
  hookText: string | null;
  status: string;
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ClipCard({ clip, index, jobId }: { clip: Clip; index: number; jobId: number }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(clip.title || "");
  const [copywriting, setCopywriting] = useState(clip.copywriting || "");
  const [hashtags, setHashtags] = useState(clip.hashtags || "");
  const [expanded, setExpanded] = useState(false);
  const utils = trpc.useUtils();

  const handleAgentUpdated = (clipId: number, data: { title: string; copywriting: string; hashtags: string }) => {
    setTitle(data.title);
    setCopywriting(data.copywriting);
    setHashtags(data.hashtags);
    utils.jobs.getClips.invalidate({ jobId });
  };

  const updateMutation = trpc.jobs.updateClipCopy.useMutation({
    onSuccess: () => {
      toast.success("文案已保存");
      setEditing(false);
      utils.jobs.getClips.invalidate();
    },
    onError: () => toast.error("保存失败，请重试"),
  });

  const handleSave = () => {
    updateMutation.mutate({ clipId: clip.id, title, copywriting, hashtags });
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("已复制到剪贴板");
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/30 transition-colors">
      {/* 视频预览区 */}
      <div className="relative bg-black aspect-video">
        {clip.videoUrl ? (
          <video
            src={clip.videoUrl}
            controls
            className="w-full h-full object-contain"
            preload="metadata"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Play className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">视频处理中...</p>
            </div>
          </div>
        )}
        <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
          切片 {index + 1}
        </div>
        <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
          {formatTime(clip.startTime)} - {formatTime(clip.endTime)} · {clip.duration.toFixed(0)}s
        </div>
      </div>

      {/* 钩子文案展示 */}
      {clip.hookText && (
        <div className="px-4 pt-3 pb-0">
          <div className="flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
            <Zap className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
            <p className="text-xs text-yellow-600 dark:text-yellow-400 font-medium leading-tight">
              {clip.hookText}
            </p>
          </div>
        </div>
      )}

      {/* 文案区域 */}
      <div className="p-4">
        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">标题</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-input border-border text-foreground text-sm"
                placeholder="抖音标题..."
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">带货文案</label>
              <Textarea
                value={copywriting}
                onChange={(e) => setCopywriting(e.target.value)}
                rows={4}
                className="bg-input border-border text-foreground text-sm resize-none"
                placeholder="带货文案..."
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">话题标签</label>
              <Input
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
                className="bg-input border-border text-foreground text-sm"
                placeholder="#标签1 #标签2..."
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="bg-primary text-primary-foreground hover:opacity-90 gap-1"
              >
                <Check className="w-3 h-3" />
                保存
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(false)}
                className="border-border text-foreground hover:bg-secondary gap-1"
              >
                <X className="w-3 h-3" />
                取消
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {/* 标题 */}
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-sm text-foreground leading-tight flex-1">
                {title || <span className="text-muted-foreground italic">暂无标题</span>}
              </p>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => handleCopy(`${title}\n\n${copywriting}\n\n${hashtags}`)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  title="复制全部"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  title="编辑文案"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 文案展开/收起 */}
            {copywriting && (
              <div>
                <p className={`text-xs text-muted-foreground leading-relaxed ${!expanded ? "line-clamp-2" : ""}`}>
                  {copywriting}
                </p>
                {copywriting.length > 80 && (
                  <button
                    onClick={() => setExpanded(!expanded)}
                    className="text-xs text-primary/70 hover:text-primary mt-1 flex items-center gap-0.5"
                  >
                    {expanded ? <><ChevronUp className="w-3 h-3" />收起</> : <><ChevronDown className="w-3 h-3" />展开</>}
                  </button>
                )}
              </div>
            )}

            {/* 话题标签 */}
            {hashtags && (
              <p className="text-xs text-primary/70">{hashtags}</p>
            )}
          </div>
        )}

        {/* AI快捷指令 */}
        {!editing && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
              <Bot className="w-3 h-3" />
              AI快捷指令
            </p>
            <ClipAgentActions clip={{ id: clip.id, title, copywriting, hashtags }} jobId={jobId} onUpdated={handleAgentUpdated} />
          </div>
        )}

        {/* 下载按鈕 */}
        <div className="flex gap-2 mt-3 pt-3 border-t border-border">
          {clip.videoUrl && (
            <a href={clip.videoUrl} download target="_blank" rel="noopener noreferrer" className="flex-1">
              <Button size="sm" variant="outline" className="w-full border-border text-foreground hover:bg-secondary gap-1 text-xs">
                <Download className="w-3 h-3" />
                下载视频
              </Button>
            </a>
          )}
          {clip.srtUrl && (
            <a href={clip.srtUrl} download target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="border-border text-foreground hover:bg-secondary gap-1 text-xs">
                <FileText className="w-3 h-3" />
                字幕
              </Button>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Results() {
  const params = useParams<{ jobId: string }>();
  const jobId = parseInt(params.jobId || "0");
  const [, navigate] = useLocation();
  const [zipping, setZipping] = useState(false);
  const [batchRewriting, setBatchRewriting] = useState(false);
  const [brandPersona, setBrandPersona] = useState<string>(() => localStorage.getItem("livestream_clipper_brand_persona") || "");
  const utils = trpc.useUtils();

  const { data: job } = trpc.jobs.getStatus.useQuery({ jobId }, { enabled: !!jobId });
  const { data: clips = [] } = trpc.jobs.getClips.useQuery({ jobId }, { enabled: !!jobId });
  const completedClips = clips.filter((c) => c.status === "completed");

  const batchRewriteMutation = trpc.agent.batchRewriteAllClips.useMutation({
    onSuccess: (data) => {
      toast.success(`批量重写完成！共更新 ${data.successCount} 个切片`);
      utils.jobs.getClips.invalidate({ jobId });
    },
    onError: () => toast.error("批量重写失败，请重试"),
    onSettled: () => setBatchRewriting(false),
  });

  const handleBatchRewrite = (instruction: "rewrite_all" | "make_younger" | "make_luxury" | "make_urgent" | "add_emoji" | "shorter" | "longer" | "custom") => {
    if (completedClips.length === 0) { toast.error("暂无切片"); return; }
    setBatchRewriting(true);
    toast.info(`正在批量重写 ${completedClips.length} 个切片的文案...`);
    batchRewriteMutation.mutate({ jobId, instruction, brandPersona: brandPersona || undefined });
  };

  const handleCopyAllCopy = () => {
    const text = completedClips
      .map((c, i) => `=== 切片 ${i + 1} ===\n标题：${c.title || ""}\n文案：${c.copywriting || ""}\n标签：${c.hashtags || ""}`)
      .join("\n\n");
    navigator.clipboard.writeText(text);
    toast.success(`已复制 ${completedClips.length} 个切片的文案`);
  };

  const handleDownloadZip = async () => {
    if (completedClips.length === 0) {
      toast.error("暂无已完成的切片");
      return;
    }
    setZipping(true);
    toast.info(`正在打包 ${completedClips.length} 个切片，请稍候...`);
    try {
      const response = await fetch(`/api/download-zip/${jobId}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "打包失败" }));
        throw new Error((err as any).error || "打包失败");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clips_job${jobId}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`已打包 ${completedClips.length} 个切片，下载已开始！`);
    } catch (err: any) {
      toast.error(err.message || "打包下载失败，请重试");
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* 顶部导航 */}
      <nav className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/history")}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">历史任务</span>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <Scissors className="w-3 h-3 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground">直播切片大师</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* ZIP一键下载按钮 */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadZip}
            disabled={completedClips.length === 0 || zipping}
            className="border-primary text-primary hover:bg-primary/10 gap-1.5 text-xs font-medium"
          >
            {zipping ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" />打包中...</>
            ) : (
              <><Archive className="w-3.5 h-3.5" />一键打包下载 ({completedClips.length})</>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyAllCopy}
            disabled={completedClips.length === 0}
            className="border-border text-foreground hover:bg-secondary gap-1.5 text-xs"
          >
            <Copy className="w-3.5 h-3.5" />
            复制全部文案
          </Button>
          <Button
            size="sm"
            onClick={() => navigate("/upload")}
            className="bg-primary text-primary-foreground hover:opacity-90 gap-1.5 text-xs"
          >
            <Scissors className="w-3.5 h-3.5" />
            新建任务
          </Button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* 任务信息 */}
        {job && (
          <div className="bg-card border border-border rounded-xl p-5 mb-8 flex items-center justify-between">
            <div>
              <h1 className="font-bold text-lg text-foreground">{job.title || "直播切片任务"}</h1>
              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                {job.productName && (
                  <span className="flex items-center gap-1">
                    <Hash className="w-3.5 h-3.5" />
                    {job.productName}
                  </span>
                )}
                <span>共 {completedClips.length} 个切片</span>
                {job.originalFileSizeMb && (
                  <span>{job.originalFileSizeMb.toFixed(0)} MB</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Package className="w-4 h-4" />
                <span>{completedClips.length}/{clips.length} 完成</span>
              </div>
              {completedClips.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  {/* 批量重写文案按鈕组 */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBatchRewrite("rewrite_all")}
                    disabled={batchRewriting}
                    className="border-purple-500/50 text-purple-400 hover:bg-purple-600/20 gap-1.5 text-xs"
                  >
                    {batchRewriting ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" />批量重写中...</>
                    ) : (
                      <><Wand2 className="w-3.5 h-3.5" />批量重写文案</>
                    )}
                  </Button>
                  {!batchRewriting && (
                    <div className="flex gap-1">
                      {(["make_younger", "make_luxury", "make_urgent"] as const).map((inst) => (
                        <button
                          key={inst}
                          onClick={() => handleBatchRewrite(inst)}
                          className="text-xs px-2 py-1 rounded border border-white/10 bg-white/5 hover:bg-purple-600/20 hover:border-purple-500/50 text-gray-400 hover:text-purple-300 transition-colors"
                        >
                          {inst === "make_younger" ? "年轻化" : inst === "make_luxury" ? "高端风" : "紧迫感"}
                        </button>
                      ))}
                    </div>
                  )}
                  <Button
                    size="sm"
                    onClick={handleDownloadZip}
                    disabled={zipping}
                    className="bg-primary text-primary-foreground hover:opacity-90 gap-1.5 text-xs"
                  >
                    {zipping ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" />打包中...</>
                    ) : (
                      <><Archive className="w-3.5 h-3.5" />一键打包全部</>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 切片网格 */}
        {clips.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Scissors className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>暂无切片，请等待处理完成</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {clips.map((clip, index) => (
              <ClipCard key={clip.id} clip={clip as Clip} index={index} jobId={jobId} />
            ))}
          </div>
        )}
      </div>

      {/* 全局AI智能体悬浮对话框 */}
      <AgentChatPanel
        jobContext={job ? {
          productName: job.productName || undefined,
          productKeywords: job.productKeywords || undefined,
          clipCount: completedClips.length,
        } : undefined}
        onBrandPersonaChange={(persona) => setBrandPersona(persona)}
      />
    </div>
  );
}
