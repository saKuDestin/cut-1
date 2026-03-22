import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import {
  Upload as UploadIcon,
  Film,
  Tag,
  ArrowLeft,
  Scissors,
  CheckCircle,
  AlertCircle,
  Zap,
} from "lucide-react";

const ACCEPTED_TYPES = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/avi", "video/mov", "video/webm"];
const MAX_SIZE_GB = 4;

type HookStyle = "suspense" | "pain_point" | "benefit";

const HOOK_OPTIONS: { value: HookStyle; label: string; desc: string; example: string }[] = [
  { value: "suspense", label: "悬念式", desc: "引发好奇心", example: "这件衣服为什么这么多人回购？" },
  { value: "pain_point", label: "痛点式", desc: "直击用户痛点", example: "胯宽腿粗的姐妹看过来！" },
  { value: "benefit", label: "利益式", desc: "突出性价比", example: "199元穿出千元质感！" },
];

export default function Upload() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [productName, setProductName] = useState("");
  const [productKeywords, setProductKeywords] = useState("");
  const [hookStyle, setHookStyle] = useState<HookStyle>("suspense");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getUploadUrlMutation = trpc.jobs.getUploadUrl.useMutation();

  const validateFile = (f: File): string | null => {
    if (!ACCEPTED_TYPES.includes(f.type) && !f.name.match(/\.(mp4|mov|avi|webm|mkv)$/i)) {
      return "请上传 MP4、MOV、AVI 或 WebM 格式的视频文件";
    }
    if (f.size > MAX_SIZE_GB * 1024 * 1024 * 1024) {
      return `文件大小不能超过 ${MAX_SIZE_GB}GB`;
    }
    return null;
  };

  const handleFile = (f: File) => {
    const err = validateFile(f);
    if (err) { toast.error(err); return; }
    setFile(f);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  const handleSubmit = async () => {
    if (!file) { toast.error("请先选择视频文件"); return; }
    if (!isAuthenticated) { window.location.href = getLoginUrl(); return; }

    setUploading(true);
    setUploadProgress(0);

    try {
      // 1. 创建任务（传入hookStyle）
      const { jobId } = await getUploadUrlMutation.mutateAsync({
        fileName: file.name,
        fileSize: file.size,
        productName,
        productKeywords,
        hookStyle,
      });

      // 2. 上传视频到服务器（流式）
      setUploadProgress(10);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/upload/${jobId}`);
      xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
      xhr.setRequestHeader("content-type", file.type || "video/mp4");

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress(10 + Math.floor((e.loaded / e.total) * 85));
        }
      };

      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status === 200) {
            setUploadProgress(100);
            resolve();
          } else {
            reject(new Error(`上传失败: ${xhr.statusText}`));
          }
        };
        xhr.onerror = () => reject(new Error("网络错误，上传失败"));
        xhr.send(file);
      });

      toast.success("视频上传成功，AI处理已开始！");
      navigate(`/processing/${jobId}`);
    } catch (err: any) {
      toast.error(err.message || "上传失败，请重试");
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDuration = (size: number) => {
    const estimatedMinutes = Math.round((size / (1024 * 1024 * 1024)) * 120);
    if (estimatedMinutes < 60) return `约 ${estimatedMinutes} 分钟`;
    return `约 ${Math.floor(estimatedMinutes / 60)} 小时 ${estimatedMinutes % 60} 分钟`;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* 顶部导航 */}
      <nav className="border-b border-border px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">返回首页</span>
        </button>
        <div className="flex items-center gap-2 ml-2">
          <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
            <Scissors className="w-3 h-3 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground">直播切片大师</span>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">上传直播视频</h1>
          <p className="text-muted-foreground">支持 MP4、MOV、AVI 格式，最大 4GB，时长 15 分钟至 3 小时</p>
        </div>

        {/* 上传区域 */}
        <div
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all mb-6 ${
            dragOver
              ? "border-primary bg-primary/5"
              : file
              ? "border-green-500/50 bg-green-500/5"
              : "border-border hover:border-primary/50 hover:bg-card"
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !uploading && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/x-msvideo,.mp4,.mov,.avi,.webm,.mkv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            disabled={uploading}
          />

          {file ? (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle className="w-12 h-12 text-green-500" />
              <div>
                <p className="font-semibold text-foreground">{file.name}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatSize(file.size)} · {formatDuration(file.size)}
                </p>
              </div>
              {!uploading && (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground underline mt-1"
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                >
                  重新选择
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Film className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">拖拽视频到此处，或点击选择文件</p>
                <p className="text-sm text-muted-foreground mt-1">MP4 · MOV · AVI · WebM · 最大 4GB</p>
              </div>
            </div>
          )}
        </div>

        {/* 开场钩子风格 */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-yellow-500" />
            <h2 className="font-semibold text-foreground">开场钩子风格</h2>
            <span className="text-xs text-muted-foreground">AI会在每个切片开头叠加吸引眼球的钩子文字</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {HOOK_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setHookStyle(opt.value)}
                disabled={uploading}
                className={`p-3 rounded-lg border-2 text-left transition-all ${
                  hookStyle === opt.value
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/40 bg-background"
                }`}
              >
                <div className="font-semibold text-sm text-foreground">{opt.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                <div className="text-xs text-primary/70 mt-1.5 italic leading-tight">"{opt.example}"</div>
              </button>
            ))}
          </div>
        </div>

        {/* 产品信息 */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Tag className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground">产品信息（可选，帮助AI更精准识别）</h2>
          </div>

          <div className="space-y-2">
            <Label htmlFor="productName" className="text-sm text-muted-foreground">产品名称</Label>
            <Input
              id="productName"
              placeholder="例如：夏季连衣裙、韩版卫衣"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              disabled={uploading}
              className="bg-input border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="productKeywords" className="text-sm text-muted-foreground">
              核心卖点关键词（用逗号分隔）
            </Label>
            <Textarea
              id="productKeywords"
              placeholder="例如：显瘦、高腰、纯棉、透气、百搭、新款"
              value={productKeywords}
              onChange={(e) => setProductKeywords(e.target.value)}
              disabled={uploading}
              rows={2}
              className="bg-input border-border text-foreground placeholder:text-muted-foreground resize-none"
            />
          </div>
        </div>

        {/* 上传进度 */}
        {uploading && (
          <div className="bg-card border border-border rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-foreground">
                {uploadProgress < 100 ? "正在上传视频..." : "上传完成，AI处理中..."}
              </span>
              <span className="text-sm text-primary font-medium">{uploadProgress}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* 提示信息 */}
        <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/30 rounded-lg p-4 mb-6">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-primary/70" />
          <div>
            <p>上传后 AI 将自动完成：语音转录 → 产品段落识别 → 视频切片 → 去重处理 → 钩子叠加 → 文案生成</p>
            <p className="mt-1">处理时间约为视频时长的 2-5 倍，1小时视频预计需要 2-5 分钟。</p>
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!file || uploading}
          className="w-full bg-primary text-primary-foreground hover:opacity-90 py-6 text-base font-semibold disabled:opacity-50"
        >
          {uploading ? (
            <span className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              处理中...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <UploadIcon className="w-4 h-4" />
              开始上传并处理
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
