import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import {
  Scissors,
  Zap,
  FileText,
  Shield,
  ArrowRight,
  Play,
  Clock,
  TrendingUp,
} from "lucide-react";

export default function Home() {
  const { user, isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* 顶部导航 */}
      <nav className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Scissors className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg text-foreground">直播切片大师</span>
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <Link href="/history">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  处理历史
                </Button>
              </Link>
              <Link href="/upload">
                <Button size="sm" className="bg-primary text-primary-foreground hover:opacity-90">
                  开始切片
                </Button>
              </Link>
            </>
          ) : (
            <a href={getLoginUrl()}>
              <Button size="sm" className="bg-primary text-primary-foreground hover:opacity-90">
                登录使用
              </Button>
            </a>
          )}
        </div>
      </nav>

      {/* Hero区域 */}
      <section className="px-6 py-20 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 mb-6 text-sm text-primary">
          <Zap className="w-3.5 h-3.5" />
          AI驱动 · 一键切片 · 自动文案
        </div>
        <h1 className="text-5xl font-bold mb-6 leading-tight">
          直播视频秒变
          <span className="text-primary"> 爆款短视频</span>
        </h1>
        <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
          上传直播回放，AI自动识别产品讲解段落，智能切片并生成抖音爆款文案，
          深度去重处理规避平台审核，批量导出即可发布。
        </p>
        <div className="flex items-center justify-center gap-4">
          {isAuthenticated ? (
            <Link href="/upload">
              <Button size="lg" className="bg-primary text-primary-foreground hover:opacity-90 gap-2 px-8 py-6 text-base">
                立即上传视频
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          ) : (
            <a href={getLoginUrl()}>
              <Button size="lg" className="bg-primary text-primary-foreground hover:opacity-90 gap-2 px-8 py-6 text-base">
                免费开始使用
                <ArrowRight className="w-4 h-4" />
              </Button>
            </a>
          )}
          {isAuthenticated && (
            <Link href="/history">
              <Button variant="outline" size="lg" className="gap-2 px-8 py-6 text-base border-border text-foreground hover:bg-secondary">
                查看历史任务
              </Button>
            </Link>
          )}
        </div>
      </section>

      {/* 功能特性 */}
      <section className="px-6 py-16 max-w-6xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-12 text-foreground">全流程自动化处理</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              icon: <Play className="w-5 h-5" />,
              title: "Whisper AI转录",
              desc: "高精度语音识别，生成带时间戳的文字，支持中文直播场景",
            },
            {
              icon: <Scissors className="w-5 h-5" />,
              title: "智能产品分段",
              desc: "大模型分析转录文本，精准识别每款产品的讲解起止时间",
            },
            {
              icon: <FileText className="w-5 h-5" />,
              title: "爆款文案生成",
              desc: "自动提取产品卖点，生成抖音风格标题、带货文案和话题标签",
            },
            {
              icon: <Shield className="w-5 h-5" />,
              title: "深度去重处理",
              desc: "画面微调+音频变速+色彩调整，多维度规避抖音重复内容检测",
            },
          ].map((f, i) => (
            <div
              key={i}
              className="bg-card border border-border rounded-xl p-6 hover:border-primary/40 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
                {f.icon}
              </div>
              <h3 className="font-semibold mb-2 text-foreground">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 处理流程 */}
      <section className="px-6 py-16 bg-card/50 border-y border-border">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-12 text-foreground">三步完成批量切片</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "上传直播视频",
                desc: "支持 MP4、MOV、AVI 等格式，15分钟至3小时均可处理",
                icon: <Clock className="w-5 h-5" />,
              },
              {
                step: "02",
                title: "AI自动处理",
                desc: "Whisper转录 → LLM分段 → FFmpeg切片 → 去重处理 → 文案生成",
                icon: <Zap className="w-5 h-5" />,
              },
              {
                step: "03",
                title: "批量下载发布",
                desc: "预览编辑每个切片的文案标题，一键打包下载所有视频和字幕",
                icon: <TrendingUp className="w-5 h-5" />,
              },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary mx-auto mb-4">
                  {s.icon}
                </div>
                <div className="text-4xl font-bold text-primary/20 mb-2">{s.step}</div>
                <h3 className="font-semibold mb-2 text-foreground">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 底部 */}
      <footer className="px-6 py-8 text-center text-muted-foreground text-sm border-t border-border">
        <p>直播切片大师 · 电商服装商家的智能短视频生产工具</p>
      </footer>
    </div>
  );
}
