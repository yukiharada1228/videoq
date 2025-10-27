/**
 * 動画のステータスに関連するユーティリティ関数
 */

export type VideoStatus = 'pending' | 'processing' | 'completed' | 'error';

/**
 * ステータスバッジのクラス名を取得
 */
export function getStatusBadgeClassName(
  status: string,
  size: 'sm' | 'md' = 'md'
): string {
  const baseClass = 'inline-flex items-center rounded-full font-medium';
  const sizeClass = size === 'sm' 
    ? 'px-2.5 py-0.5 text-xs' 
    : 'px-3 py-1 text-sm';
  
  const statusColors: Record<VideoStatus | 'default', string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    processing: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800',
    default: 'bg-gray-100 text-gray-800',
  };
  
  return `${baseClass} ${sizeClass} ${statusColors[status as VideoStatus] || statusColors.default}`;
}

/**
 * ステータスの日本語ラベルを取得
 */
export function getStatusLabel(status: string): string {
  const labels: Record<VideoStatus, string> = {
    pending: '待機中',
    processing: '処理中',
    completed: '完了',
    error: 'エラー',
  };
  
  return labels[status as VideoStatus] || status;
}

