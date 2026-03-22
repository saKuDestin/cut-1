# 部署指南

本文档说明如何将**直播切片大师**部署到自己的服务器上独立运行。

## 所需外部服务

| 服务 | 用途 | 免费额度 | 注册地址 |
|------|------|---------|---------|
| **DeepSeek API** | AI 文案生成、对话 | 有（新用户赠送额度） | https://platform.deepseek.com/ |
| **Groq API** | 语音转录（Whisper） | 有（每天免费额度充足） | https://console.groq.com/ |
| **AWS S3 / 兼容存储** | 视频和文件存储 | S3 有免费层；R2 免费额度更大 | https://aws.amazon.com/ 或 https://dash.cloudflare.com/ |
| **MySQL 数据库** | 存储任务、用户、切片数据 | 自建或云服务 | 任意 MySQL 5.7+ 实例 |

## 快速开始

### 第一步：克隆项目

```bash
git clone https://github.com/saKuDestin/cut-1.git
cd cut-1
```

### 第二步：安装依赖

```bash
pnpm install
```

### 第三步：配置环境变量

```bash
cp .env.example .env
```

用文本编辑器打开 `.env`，填入以下必填项：

```env
DATABASE_URL=mysql://root:密码@localhost:3306/livestream_clipper
JWT_SECRET=随机字符串（至少32位）
DEEPSEEK_API_KEY=sk-xxxxxxxx
GROQ_API_KEY=gsk_xxxxxxxx
S3_ACCESS_KEY_ID=AKIAXXXXXXXX
S3_SECRET_ACCESS_KEY=xxxxxxxx
S3_BUCKET=your-bucket-name
S3_REGION=us-east-1
```

### 第四步：创建数据库

在 MySQL 中执行：

```sql
CREATE DATABASE livestream_clipper CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 第五步：运行数据库迁移

```bash
npx drizzle-kit migrate
```

### 第六步：启动服务

**开发模式（带热重载）：**
```bash
pnpm dev
```

**生产模式：**
```bash
pnpm build
pnpm start
```

访问 `http://localhost:3000`，点击右上角注册账号即可开始使用。

---

## 各云存储配置说明

### Cloudflare R2（推荐，免费额度最大）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左侧菜单 → R2 Object Storage → Create bucket
3. 右上角 → Manage R2 API Tokens → Create API Token
4. 在 `.env` 中配置：

```env
S3_ACCESS_KEY_ID=your-r2-access-key-id
S3_SECRET_ACCESS_KEY=your-r2-secret-access-key
S3_BUCKET=your-bucket-name
S3_REGION=auto
S3_ENDPOINT=https://你的AccountID.r2.cloudflarestorage.com
```

### 阿里云 OSS

```env
S3_ACCESS_KEY_ID=your-access-key-id
S3_SECRET_ACCESS_KEY=your-access-key-secret
S3_BUCKET=your-bucket-name
S3_REGION=oss-cn-hangzhou
S3_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
```

### 腾讯云 COS

```env
S3_ACCESS_KEY_ID=your-secret-id
S3_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET=your-bucket-name
S3_REGION=ap-guangzhou
S3_ENDPOINT=https://cos.ap-guangzhou.myqcloud.com
```

---

## 注意事项

- **S3 Bucket 权限**：确保 Bucket 允许程序读写，建议设置私有访问（通过预签名 URL 访问）
- **视频文件大小**：Groq Whisper 单文件限制 25MB，超大视频会先提取音频再转录
- **并发控制**：系统默认最多同时处理 2 个任务，防止服务器过载
- **JWT 密钥**：生产环境务必设置强随机密钥，不要使用默认值
