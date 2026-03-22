import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import {
  Scissors,
  Plus,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
  Film,
  Hash,
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

const STATUS_CONFIG: Record<JobStatus, { label: string; color: string; icon: React.ReactNode }> = {
  uploading: { label: "上传中", color: "text-blue-400", icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  transcribing: { label: "转录中", color: "text-yellow-400", icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  analyzing: { label: "分析中", color: "text-yellow-400", icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  clipping: { label: "切片中", color: "text-orange-400", icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  deduplicating: { label: "去重中", color: "text-orange-400", icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  generating_copy: { label: "生成文案", color: "text-purple-400", icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  completed: { label: "已完成", color: "text-green-400", icon: <CheckCircle className="w-3.5 h-3.5" /> },
  failed: { label: "失败", color: "text-red-400", icon: <AlertCircle className="w-3.5 h-3.5" /> },
};

function formatDate(date: Date | string) {
  const d = new Date(date);
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function History() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  const { data: jobs = [], isLoading } = trpc.jobs.list.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Scissors className="w-12 h-12 text-primary mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">请先登录</h2>
          <p className="text-muted-foreground mb-6">登录后查看您的处理历史</p>
          <a href={getLoginUrl()}>
            <Button className="bg-primary text-primary-foreground hover:opacity-90">
              立即登录
            </Button>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* 顶部导航 */}
      <nav className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate("/")} className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <Scissors className="w-3 h-3 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground">直播切片大师</span>
          </button>
        </div>
        <Button
          onClick={() => navigate("/upload")}
          size="sm"
          className="bg-primary text-primary-foreground hover:opacity-90 gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          新建任务
        </Button>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-foreground">处理历史</h1>
          <span className="text-sm text-muted-foreground">{jobs.length} 个任务</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-20">
            <Film className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">还没有处理记录</h2>
            <p className="text-muted-foreground mb-6">上传您的第一个直播视频开始切片</p>
            <Button
              onClick={() => navigate("/upload")}
              className="bg-primary text-primary-foreground hover:opacity-90 gap-2"
            >
              <Plus className="w-4 h-4" />
              上传视频
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => {
              const statusConf = STATUS_CONFIG[job.status as JobStatus] || STATUS_CONFIG.failed;
              const isProcessing = !["completed", "failed"].includes(job.status);

              return (
                <div
                  key={job.id}
                  className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 transition-colors cursor-pointer"
                  onClick={() => {
                    if (job.status === "completed") navigate(`/results/${job.id}`);
                    else if (isProcessing) navigate(`/processing/${job.id}`);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Film className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {job.title || job.originalFileName || "未命名任务"}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {job.productName && (
                            <span className="flex items-center gap-0.5">
                              <Hash className="w-3 h-3" />
                              {job.productName}
                            </span>
                          )}
                          {job.totalClips && job.totalClips > 0 && (
                            <span>{job.totalClips} 个切片</span>
                          )}
                          {job.originalFileSizeMb && (
                            <span>{job.originalFileSizeMb.toFixed(0)} MB</span>
                          )}
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-3 h-3" />
                            {formatDate(job.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      {/* 进度条（处理中） */}
                      {isProcessing && (
                        <div className="w-24 hidden sm:block">
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${job.progress || 0}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground text-right mt-0.5">
                            {job.progress || 0}%
                          </p>
                        </div>
                      )}

                      <div className={`flex items-center gap-1 text-xs font-medium ${statusConf.color}`}>
                        {statusConf.icon}
                        {statusConf.label}
                      </div>

                      {(job.status === "completed" || isProcessing) && (
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {job.status === "failed" && job.errorMessage && (
                    <p className="text-xs text-red-400 mt-2 pl-13">{job.errorMessage}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
