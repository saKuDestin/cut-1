export const ENV = {
  // 应用基础配置
  cookieSecret: process.env.JWT_SECRET ?? "change-me-in-production-use-random-string",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",

  // AI 服务
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? "",
  groqApiKey: process.env.GROQ_API_KEY ?? "",

  // AWS S3 / 兼容 S3 协议的对象存储
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  s3Bucket: process.env.S3_BUCKET ?? process.env.S3_BUCKET_NAME ?? "",
  s3Region: process.env.S3_REGION ?? "us-east-1",
  s3Endpoint: process.env.S3_ENDPOINT ?? "",  // 可选：自定义 endpoint（阿里云/腾讯云/R2/MinIO）

  // 管理员账号（首次部署时用于创建管理员）
  adminEmail: process.env.ADMIN_EMAIL ?? "",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",

  // 以下为兼容旧代码保留，不再使用
  appId: "",
  oAuthServerUrl: "",
  ownerOpenId: "",
  forgeApiUrl: "",
  forgeApiKey: "",
};
