/**
 * 通知模块（已简化）
 * 原 Manus Forge 通知功能已移除，此处为空实现保持接口兼容
 */

export type NotificationPayload = {
  title: string;
  content: string;
};

/**
 * 向管理员发送通知（当前为空实现）
 * 如需通知功能，可集成邮件服务（如 nodemailer + SMTP）
 */
export async function notifyOwner(payload: NotificationPayload): Promise<boolean> {
  console.log(`[Notification] 通知（未配置通知服务）: ${payload.title} - ${payload.content}`);
  return false;
}
