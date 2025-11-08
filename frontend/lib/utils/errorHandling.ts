/**
 * 共通のエラーハンドリング関数
 * @param err - エラーオブジェクト
 * @param defaultMessage - デフォルトのエラーメッセージ
 * @param setError - エラーメッセージを設定する関数
 */
export const handleAsyncError = (
  err: unknown, 
  defaultMessage: string, 
  setError: (msg: string) => void
): void => {
  const errorMessage = err instanceof Error && err.message ? err.message : defaultMessage;
  setError(errorMessage);
  console.error(defaultMessage, err);
};

