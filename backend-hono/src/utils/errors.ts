import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * アプリ共通のエラー型。ハンドラ/サービスから投げると error-handler が
 * 統一レスポンスへ変換する。内部詳細はレスポンスに含めない（要件 SEC-8）。
 */
export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly expose: boolean;

  constructor(
    status: ContentfulStatusCode,
    code: string,
    message: string,
    expose = true,
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.expose = expose; // false の場合、クライアントには汎用メッセージのみ返す
  }
}

export const badRequest = (message: string, code = "bad_request") =>
  new AppError(400, code, message);
export const unauthorized = (message = "Unauthorized", code = "unauthorized") =>
  new AppError(401, code, message);
export const forbidden = (message = "Forbidden", code = "forbidden") =>
  new AppError(403, code, message);
export const notFound = (message = "Not Found", code = "not_found") =>
  new AppError(404, code, message);
export const serviceUnavailable = (
  message: string,
  code = "service_unavailable",
) => new AppError(503, code, message);
