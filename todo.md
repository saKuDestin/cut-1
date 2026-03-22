# 直播切片大师 - 项目 TODO

## 数据库与后端基础
- [x] 设计数据库 Schema（jobs、clips、transcripts 表）
- [x] 执行数据库迁移
- [x] 安装 FFmpeg 系统依赖
- [x] 安装后端 Node.js 依赖（fluent-ffmpeg、uuid、node-fetch、archiver 等）

## 后端核心处理逻辑
- [x] 视频上传接口（流式上传到 S3，/api/upload/:jobId）
- [x] Whisper ASR 音频转录接口（带时间戳，支持中文）
- [x] LLM 智能分段分析接口（识别产品讲解段落，15-60秒）
- [x] FFmpeg 视频切片处理（精准时间段切割）
- [x] 字幕 SRT 文件生成（带时间戳，上传S3）
- [x] 深度去重处理（画面缩放/裁剪/调色/噪点、音频变速，每切片随机参数）
- [x] 带货文案和标题生成（LLM，抖音风格）
- [x] 切片视频上传到 S3（CDN可访问）
- [x] 任务状态查询接口（实时进度轮询）
- [x] tRPC 路由（getUploadUrl、confirmUpload、getStatus、list、getClips、getTranscript、updateClipCopy）

## 前端界面
- [x] 首页/落地页设计（深色工业风，功能介绍，CTA按钮）
- [x] 视频上传页（拖拽上传、产品名称/卖点输入、XHR进度条）
- [x] 实时处理进度页（各阶段状态展示，自动轮询，完成后跳转）
- [x] 切片结果页（视频预览、文案编辑、字幕下载、复制文案）
- [x] 任务历史列表（状态显示、进度条、点击跳转）

## 测试与部署
- [x] 编写 vitest 单元测试（11个测试全部通过）
- [x] 集成联调（TypeScript 0错误，服务器正常运行）
- [x] 保存检查点

## Bug修复
- [x] 修复视频上传失败问题（中文文件名导致XHR setRequestHeader失败，改为encodeURIComponent编码）
- [x] 修复大文件上传（流式转发到S3，不缓冲内存，支持4GB视频）
- [x] 修复上传后处理流程自动触发（upload接口直接调用processJob）
- [x] 增加文件名编码单元测试（3个用例）
- [x] 端到端处理流程验证（processJob完整跑通）

## 新功能（v1.2 + v1.3）
- [x] 后端：LLM生成视频钉子文案（悬念式/痛点式/利益式，3种风格）
- [x] 后端：FFmpeg将钉子文字叠加到切片视频开头
- [x] 后端：ZIP批量打包接口（/api/download-zip/:jobId，打包全部切片视频+SRT字幕+文案TXT）
- [x] 前端：结果页添加"一键打包下载"按钮（显示打包进度）
- [x] 前端：切片卡片展示钉子文案（黄色闪电图标标注）
- [x] 前端：上传页添加钉子风格选择（悬念式/痛点式/利益式）
- [x] 20个单元测试全部通过

## 智能体功能（v1.4）✅ 已完成
- [x] 配置 DeepSeek API Key 到项目环境变量（`DEEPSEEK_API_KEY`）
- [x] 后端：DeepSeek 流式对话接口（`/api/agent/chat/stream`，SSE 流式返回）
- [x] 后端：切片文案重写接口（`trpc.agent.rewriteClipCopy`，支持 11 种内置指令 + 自定义指令）
- [x] 后端：全局智能体指令解析（品牌人设、限定词、风格偏好持久化到数据库 `users.brandPersona`）
- [x] 前端：全局悬浮 AI 对话框（侧边栏，SSE 流式逐字输出，支持停止生成，聊天记录持久化最多20条）
- [x] 前端：切片卡片快捷指令按钮（重写标题/换风格/重新生成/加限定词，`ClipAgentActions` 组件）
- [x] 前端：上传页"全局提示词"输入框（为本次任务设置全局限定词，自动同步品牌人设）
- [x] 测试智能体功能并保存检查点

## 平台独立化改造（v1.5）✅ 已完成
- [x] 存储层：将 Manus Forge Storage 替换为 AWS S3（兼容 Cloudflare R2 / 阿里云 OSS / 腾讯云 COS）
- [x] 语音转录：将 Forge Whisper 替换为 Groq Whisper API（`whisper-large-v3-turbo`）
- [x] LLM 层：将 Forge LLM 替换为 DeepSeek API（`deepseek-chat`）
- [x] 认证层：将 Manus OAuth 替换为账号密码登录 + JWT Cookie 会话（bcrypt 密码哈希）
- [x] 前端：新增登录页（`/login`）和注册页（`/register`）
- [x] 数据库：`users` 表新增 `passwordHash` 字段支持本地账号
- [x] 修复 TiDB Cloud SSL 连接问题（改用 `mysql2.createPool()` 显式传入 SSL 参数）
- [x] 新增 `.env.example` 配置模板和 `DEPLOY.md` 部署文档

## 功能增强（v1.6）✅ 已完成
- [x] 后端：任务并发队列（最多 2 个任务同时处理，防止 FFmpeg 进程耗尽内存）
- [x] 后端：任务软删除接口（`trpc.deleteJob`）
- [x] 后端：失败任务重试接口（`trpc.retryJob`）
- [x] 后端：品牌人设持久化接口（`trpc.agent.getBrandPersona` / `clearBrandPersona`）
- [x] 后端：任务状态精细化同步（`clipping → deduplicating → generating_copy`，每阶段独立更新进度）
- [x] 前端：历史页新增搜索框（按任务名/产品名）、状态筛选（全部/已完成/失败/处理中）
- [x] 前端：历史页新增统计概览卡片（总任务数/完成数/失败数）
- [x] 前端：历史页新增删除按钮（二次确认防误操作）和重试按钮（仅失败任务可用）
- [x] 数据库：`jobs` 表新增 `globalPrompt`（全局提示词）和 `deletedAt`（软删除时间戳）字段
