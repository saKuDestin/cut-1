export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * 获取登录页 URL
 * 已替换为本地账号密码登录页，不再依赖 Manus OAuth
 */
export function getLoginUrl(): string {
  return "/login";
}
