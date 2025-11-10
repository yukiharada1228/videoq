import { initI18n } from "@/i18n/config";

/**
 * 共通のエラーハンドリングユーティリティ
 */

const i18n = initI18n();

/**
 * 非同期エラーを処理する共通関数
 * @param error - エラーオブジェクト
 * @param defaultMessage - デフォルトのエラーメッセージ
 * @param onError - エラー時のコールバック関数
 */
export function handleAsyncError(
  error: unknown,
  defaultMessage: string,
  onError: () => void
): void {
  const errorMessage = error instanceof Error ? error.message : defaultMessage;
    console.error("Async operation failed:", errorMessage);
  onError();
}

/**
 * APIエラーレスポンスを処理する共通関数
 * @param response - レスポンスオブジェクト
 * @returns エラーメッセージまたはnull
 */
export function handleApiError(response: Response): string | null {
  if (!response.ok) {
    switch (response.status) {
      case 400:
        return i18n.t("errors.badRequest");
      case 401:
        return i18n.t("errors.unauthorized");
      case 403:
        return i18n.t("errors.forbidden");
      case 404:
        return i18n.t("errors.notFound");
      case 500:
        return i18n.t("errors.server");
      default:
        return i18n.t("errors.generic", { status: response.status });
    }
  }
  return null;
}

/**
 * バリデーションエラーを処理する共通関数
 * @param errors - バリデーションエラーの配列
 * @returns エラーメッセージ
 */
export function handleValidationErrors(errors: string[]): string {
  if (errors.length === 0) return "";
  if (errors.length === 1) return errors[0];
  return i18n.t("errors.multiple", { errors: errors.join(", ") });
}
