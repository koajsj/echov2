import { HttpError } from "../api/http-error.js";

export function requireReviewedCrypto(): void {
  throw new HttpError(
    503,
    "MLS_NOT_READY",
    "MLS 浏览器、可信身份、原子持久化和无效 Commit 恢复门槛尚未通过。消息写入关闭。",
  );
}
