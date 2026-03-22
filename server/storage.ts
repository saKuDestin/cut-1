/**
 * 存储层 - 使用 AWS S3（兼容 S3 协议的对象存储）
 * 支持：AWS S3 / 阿里云 OSS / 腾讯云 COS / Cloudflare R2 / MinIO 等
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

function getS3Client(): S3Client {
  if (!ENV.s3AccessKeyId || !ENV.s3SecretAccessKey || !ENV.s3Bucket) {
    throw new Error(
      "S3 配置缺失：请设置 S3_ACCESS_KEY_ID、S3_SECRET_ACCESS_KEY、S3_BUCKET"
    );
  }

  const config: ConstructorParameters<typeof S3Client>[0] = {
    region: ENV.s3Region || "us-east-1",
    credentials: {
      accessKeyId: ENV.s3AccessKeyId,
      secretAccessKey: ENV.s3SecretAccessKey,
    },
  };

  // 支持自定义 endpoint（阿里云 OSS、腾讯云 COS、Cloudflare R2、MinIO 等）
  if (ENV.s3Endpoint) {
    config.endpoint = ENV.s3Endpoint;
    config.forcePathStyle = true; // MinIO 等需要路径风格
  }

  return new S3Client(config);
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

/**
 * 上传文件到 S3
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const client = getS3Client();
  const key = normalizeKey(relKey);
  const bucket = ENV.s3Bucket!;

  const body = typeof data === "string" ? Buffer.from(data, "utf-8") : data;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  // 生成预签名下载 URL（有效期 7 天）
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 7 * 24 * 3600 }
  );

  return { key, url };
}

/**
 * 获取文件的预签名下载 URL
 */
export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const client = getS3Client();
  const key = normalizeKey(relKey);
  const bucket = ENV.s3Bucket!;

  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 7 * 24 * 3600 }
  );

  return { key, url };
}

/**
 * 删除 S3 文件
 */
export async function storageDelete(relKey: string): Promise<void> {
  const client = getS3Client();
  const key = normalizeKey(relKey);
  const bucket = ENV.s3Bucket!;

  await client.send(
    new DeleteObjectCommand({ Bucket: bucket, Key: key })
  );
}
