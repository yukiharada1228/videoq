/**
 * 共通のコンポーネントパターン
 */

import React from 'react';

/**
 * 共通のボタンプロパティ
 */
export interface CommonButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * 共通のカードプロパティ
 */
export interface CommonCardProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
  onClick?: () => void;
}

/**
 * 共通のモーダルプロパティ
 */
export interface CommonModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

/**
 * 共通のフォームプロパティ
 */
export interface CommonFormProps<T = unknown> {
  onSubmit: (data: T) => void;
  children: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  className?: string;
}

/**
 * 共通のリストプロパティ
 */
export interface CommonListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  emptyMessage?: string;
  loading?: boolean;
  className?: string;
}

/**
 * 共通のページプロパティ
 */
export interface CommonPageProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  className?: string;
}

/**
 * 共通のアラートプロパティ
 */
export interface CommonAlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  onClose?: () => void;
  className?: string;
}

/**
 * 共通のローディングプロパティ
 */
export interface CommonLoadingProps {
  message?: string;
  fullScreen?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * 共通のアイテムプロパティ
 */
export interface CommonItemProps {
  id: string | number;
  title: string;
  description?: string;
  image?: string;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  selected?: boolean;
  className?: string;
}

/**
 * 共通の検索プロパティ
 */
export interface CommonSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onSearch?: (query: string) => void;
  onClear?: () => void;
  className?: string;
}

/**
 * 共通のフィルタープロパティ
 */
export interface CommonFilterProps<T = unknown> {
  filters: Record<string, T>;
  onChange: (filters: Record<string, T>) => void;
  onReset?: () => void;
  className?: string;
}

/**
 * 共通のページネーションプロパティ
 */
export interface CommonPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showSizeChanger?: boolean;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  className?: string;
}
