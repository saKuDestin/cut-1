import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Mic,
  Brain,
  Scissors,
  Shield,
  FileText,
  CheckCircle,
  Loader2,
  Clock,
  ArrowRight,
  AlertCircle,
} from "lucide-react";

type JobStatus =
  | "uploading"
  | "transcribing"
  | "analyzing"
  | "clipping"
  | "deduplicating"
  | "generating_copy"
  | "completed"
  | "failed";

const STAGES = [
  { key: "transcribing", label: "Whisper语音转录", desc: "将直播音频转为带时间戳的文字", icon: Mic },
  { key: "analyzing", label: "AI产品段落识别", desc: "大模型分析识别每款产品的讲解时间段", icon: Brain },
  { key: "clipping", label: "FFmpeg视频切片", desc: "按产品段落自动切割视频片段", icon: Scissors },
  { key: "deduplicating", label: "深度去重处理", desc: "画面调色+音频变速，规避平台审核", icon: Shield },
  { key: "generating_copy", label: "带货文案生成", desc: "AI生成抖音爆款标题和带货文案", icon: FileText },
];

function getStageIndex(status: JobStatus): number {
  const map: Record<JobStatus, number> = {
    uploading: -1,
    transcribing: 0,
    analyzing: 1,
    clipping: 2,
    deduplicating: 3,
    generating_copy: 4,
    completed: 5,
    failed: -1,
  };
  return map[status] ?? -1;
}

export default function Processing() {
  const params = useParams<{ jobId: string }>();
  const jobId = parseInt(params.jobId || "0");
  const [, navigate] = useLocation();
  const [pollInterval, setPollInterval] = useState(2000);

  const { data: job, refetch } = trpc.jobs.getStatus.useQuery(
    { jobId },
    { enabled: !!jobId, refetchInterval: pollInterval }
  );

  useEffect(() => {
    if (job?.status === "completed") {
      setPollInterval(0);
      setTimeout(() => navigate(`/results/${jobId}`), 1500);
    } else if (job?.status === "failed") {
      setPollInterval(0);
    }
  }, [job?.status]);

  const currentStageIndex = job ? getStageIndex(job.status as JobStatus) : -1;
  const progress = job?.progress ?? 0;

  if (!job) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
            <Scissors className="w-3 h-3 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground">直播切片大师</span>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* 标题 */}
        <div className="text-center mb-10">
          {job.status === "completed" ? (
            <>
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-foreground">处理完成！</h1>
              <p className="text-muted-foreground mt-2">
                共生成 <span className="text-primary font-semibold">{job.totalClips}</span> 个切片视频，正在跳转...
              </p>
            </>
          ) : job.status === "failed" ? (
            <>
              <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-foreground">处理失败</h1>
              <p className="text-muted-foreground mt-2">{job.errorMessage || "处理过程中出现错误"}</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center mx-auto mb-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">AI 正在处理中</h1>
              <p className="text-muted-foreground mt-2">
                {job.originalFileName && (
                  <span className="text-foreground/70">{job.originalFileName} · </span>
                )}
                请耐心等待，不要关闭此页面
              </p>
            </>
          )}
        </div>

        {/* 总进度条 */}
        <div className="bg-card border border-border rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-foreground">总体进度</span>
            <span className="text-sm font-bold text-primary">{progress}%</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, oklch(0.65 0.22 25), oklch(0.70 0.20 45))",
              }}
            />
          </div>
          {job.totalClips && job.totalClips > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              预计生成 {job.totalClips} 个切片
            </p>
          )}
        </div>

        {/* 各阶段状态 */}
        <div className="space-y-3">
          {STAGES.map((stage, index) => {
            const Icon = stage.icon;
            const isDone = currentStageIndex > index;
            const isActive = currentStageIndex === index;
            const isPending = currentStageIndex < index;

            return (
              <div
                key={stage.key}
                className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                  isActive
                    ? "border-primary/50 bg-primary/5"
                    : isDone
                    ? "border-green-500/30 bg-green-500/5"
                    : "border-border bg-card opacity-50"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    isDone
                      ? "bg-green-500/20 text-green-500"
                      : isActive
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isDone ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : isActive ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-sm ${isActive || isDone ? "text-foreground" : "text-muted-foreground"}`}>
                    {stage.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stage.desc}</p>
                </div>
                {isDone && (
                  <span className="text-xs text-green-500 font-medium shrink-0">完成</span>
                )}
                {isActive && (
                  <span className="text-xs text-primary font-medium shrink-0 animate-pulse">处理中</span>
                )}
              </div>
            );
          })}
        </div>

        {/* 完成后的操作 */}
        {job.status === "completed" && (
          <div className="mt-8 text-center">
            <Button
              onClick={() => navigate(`/results/${jobId}`)}
              className="bg-primary text-primary-foreground hover:opacity-90 gap-2 px-8 py-5"
            >
              查看切片结果
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {job.status === "failed" && (
          <div className="mt-8 text-center">
            <Button
              onClick={() => navigate("/upload")}
              variant="outline"
              className="border-border text-foreground hover:bg-secondary gap-2"
            >
              重新上传
            </Button>
          </div>
        )}

        {/* 等待提示 */}
        {job.status !== "completed" && job.status !== "failed" && (
          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>处理时间约为视频时长的 2-5 倍，请耐心等待</span>
          </div>
        )}
      </div>
    </div>
  );
}
