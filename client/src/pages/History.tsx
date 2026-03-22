import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
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
  Trash2,
  RefreshCw,
  Filter,
  Search,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";

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

const FILTER_OPTIONS: { value: "all" | JobStatus; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
  { value: "transcribing", label: "处理中" },
];

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
  const [filterStatus, setFilterStatus] = useState<"all" | JobStatus>("all");
  const [searchText, setSearchText] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: jobs = [], isLoading } = trpc.jobs.list.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });

  const deleteJobMutation = trpc.jobs.deleteJob.useMutation({
    onSuccess: () => {
      toast.success("任务已删除");
      utils.jobs.list.invalidate();
      setConfirmDeleteId(null);
    },
    onError: (err) => {
      toast.error(err.message || "删除失败，请重试");
    },
    onSettled: () => setDeletingId(null),
  });

  const retryJobMutation = trpc.jobs.retryJob.useMutation({
    onSuccess: (_, variables) => {
      toast.success("任务已重新开始处理");
      utils.jobs.list.invalidate();
      navigate(`/processing/${variables.jobId}`);
    },
    onError: (err) => {
      toast.error(err.message || "重试失败，请重试");
    },
    onSettled: () => setRetryingId(null),
  });

  const handleDelete = (jobId: number) => {
    if (confirmDeleteId === jobId) {
      setDeletingId(jobId);
      deleteJobMutation.mutate({ jobId });
    } else {
      setConfirmDeleteId(jobId);
      // 3秒后自动取消确认
      setTimeout(() => setConfirmDeleteId((prev) => (prev === jobId ? null : prev)), 3000);
    }
  };

  const handleRetry = (jobId: number) => {
    setRetryingId(jobId);
    retryJobMutation.mutate({ jobId });
  };

  // 筛选逻辑
  const filteredJobs = jobs.filter((job) => {
    const matchStatus =
      filterStatus === "all" ||
      (filterStatus === "transcribing"
        ? !["completed", "failed"].includes(job.status)
        : job.status === filterStatus);

    const matchSearch =
      !searchText ||
      (job.title || "").toLowerCase().includes(searchText.toLowerCase()) ||
      (job.productName || "").toLowerCase().includes(searchText.toLowerCase()) ||
      (job.originalFileName || "").toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const processingCount = jobs.filter((j) => !["completed", "failed"].includes(j.status)).length;
  const completedCount = jobs.filter((j) => j.status === "completed").length;
  const failedCount = jobs.filter((j) => j.status === "failed").length;

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
        {/* 统计概览 */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{jobs.length}</p>
            <p className="text-xs text-muted-foreground mt-1">全部任务</p>
          </div>
          <div className="bg-card border border-green-500/20 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-green-400">{completedCount}</p>
            <p className="text-xs text-muted-foreground mt-1">已完成</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-orange-400">{processingCount}</p>
            <p className="text-xs text-muted-foreground mt-1">处理中</p>
          </div>
        </div>

        {/* 搜索 + 筛选 */}
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索任务名称、产品名..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-9 bg-card border-border text-foreground placeholder:text-muted-foreground"
            />
            {searchText && (
              <button
                onClick={() => setSearchText("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-muted-foreground" />
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilterStatus(opt.value)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  filterStatus === opt.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {opt.label}
                {opt.value === "failed" && failedCount > 0 && (
                  <span className="ml-1 text-red-400">({failedCount})</span>
                )}
                {opt.value === "transcribing" && processingCount > 0 && (
                  <span className="ml-1 text-orange-400">({processingCount})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="text-center py-20">
            <Film className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            {jobs.length === 0 ? (
              <>
                <h2 className="text-lg font-semibold text-foreground mb-2">还没有处理记录</h2>
                <p className="text-muted-foreground mb-6">上传您的第一个直播视频开始切片</p>
                <Button
                  onClick={() => navigate("/upload")}
                  className="bg-primary text-primary-foreground hover:opacity-90 gap-2"
                >
                  <Plus className="w-4 h-4" />
                  上传视频
                </Button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-foreground mb-2">没有匹配的任务</h2>
                <p className="text-muted-foreground">尝试修改搜索词或筛选条件</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredJobs.map((job) => {
              const statusConf = STATUS_CONFIG[job.status as JobStatus] || STATUS_CONFIG.failed;
              const isProcessing = !["completed", "failed"].includes(job.status);
              const isDeleting = deletingId === job.id;
              const isRetrying = retryingId === job.id;
              const isConfirmingDelete = confirmDeleteId === job.id;

              return (
                <div
                  key={job.id}
                  className={`bg-card border rounded-xl p-5 transition-all ${
                    isConfirmingDelete
                      ? "border-red-500/50 bg-red-500/5"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    {/* 左侧信息 - 可点击跳转 */}
                    <div
                      className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                      onClick={() => {
                        if (job.status === "completed") navigate(`/results/${job.id}`);
                        else if (isProcessing) navigate(`/processing/${job.id}`);
                      }}
                    >
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

                    {/* 右侧操作区 */}
                    <div className="flex items-center gap-2 shrink-0 ml-4">
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

                      {/* 状态标签 */}
                      <div className={`flex items-center gap-1 text-xs font-medium ${statusConf.color}`}>
                        {statusConf.icon}
                        {statusConf.label}
                      </div>

                      {/* 跳转箭头 */}
                      {(job.status === "completed" || isProcessing) && (
                        <button
                          onClick={() => {
                            if (job.status === "completed") navigate(`/results/${job.id}`);
                            else if (isProcessing) navigate(`/processing/${job.id}`);
                          }}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      )}

                      {/* 重试按钮（仅失败任务） */}
                      {job.status === "failed" && (
                        <button
                          onClick={() => handleRetry(job.id)}
                          disabled={isRetrying}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-50"
                          title="重新处理"
                        >
                          {isRetrying ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                          <span className="hidden sm:inline">重试</span>
                        </button>
                      )}

                      {/* 删除按钮（仅已完成/失败任务） */}
                      {(job.status === "completed" || job.status === "failed") && (
                        <button
                          onClick={() => handleDelete(job.id)}
                          disabled={isDeleting}
                          className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                            isConfirmingDelete
                              ? "border-red-500 bg-red-500/20 text-red-400"
                              : "border-border text-muted-foreground hover:border-red-500/40 hover:text-red-400"
                          }`}
                          title={isConfirmingDelete ? "再次点击确认删除" : "删除任务"}
                        >
                          {isDeleting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                          <span className="hidden sm:inline">
                            {isConfirmingDelete ? "确认删除" : "删除"}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 失败原因 */}
                  {job.status === "failed" && job.errorMessage && (
                    <p className="text-xs text-red-400 mt-2 pl-13 truncate" title={job.errorMessage}>
                      错误：{job.errorMessage}
                    </p>
                  )}

                  {/* 删除确认提示 */}
                  {isConfirmingDelete && (
                    <div className="mt-2 flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                      <p className="text-xs text-red-400">确定要删除这个任务吗？此操作不可撤销。</p>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs text-muted-foreground hover:text-foreground ml-4"
                      >
                        取消
                      </button>
                    </div>
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
