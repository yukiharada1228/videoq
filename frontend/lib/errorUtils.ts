/**
 * 共通のエラーハンドリングユーティリティ（DRY原則）
 */

/**
 * 非同期エラーを処理する共通関数（DRY原則）
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
  console.error('Async operation failed:', errorMessage);
  onError();
}

/**
 * APIエラーレスポンスを処理する共通関数（DRY原則）
 * @param response - レスポンスオブジェクト
 * @returns エラーメッセージまたはnull
 */
export function handleApiError(response: Response): string | null {
  if (!response.ok) {
    switch (response.status) {
      case 400:
        return 'リクエストが無効です';
      case 401:
        return '認証が必要です';
      case 403:
        return 'アクセスが拒否されました';
      case 404:
        return 'リソースが見つかりません';
      case 500:
        return 'サーバーエラーが発生しました';
      default:
        return `エラーが発生しました (${response.status})`;
    }
  }
  return null;
}

/**
 * バリデーションエラーを処理する共通関数（DRY原則）
 * @param errors - バリデーションエラーの配列
 * @returns エラーメッセージ
 */
export function handleValidationErrors(errors: string[]): string {
  if (errors.length === 0) return '';
  if (errors.length === 1) return errors[0];
  return `複数のエラーがあります: ${errors.join(', ')}`;
}
