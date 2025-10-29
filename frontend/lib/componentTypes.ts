/**
 * 共通のコンポーネントパターン（DRY原則）
 */

import React from 'react';

/**
 * 共通のボタンプロパティ（DRY原則）
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
 * 共通のカードプロパティ（DRY原則）
 */
export interface CommonCardProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
  onClick?: () => void;
}

/**
 * 共通のモーダルプロパティ（DRY原則）
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
 * 共通のフォームプロパティ（DRY原則）
 */
export interface CommonFormProps {
  onSubmit: (data: any) => void;
  children: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  className?: string;
}

/**
 * 共通のリストプロパティ（DRY原則）
 */
export interface CommonListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  emptyMessage?: string;
  loading?: boolean;
  className?: string;
}

/**
 * 共通のページプロパティ（DRY原則）
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
 * 共通のアラートプロパティ（DRY原則）
 */
export interface CommonAlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  onClose?: () => void;
  className?: string;
}

/**
 * 共通のローディングプロパティ（DRY原則）
 */
export interface CommonLoadingProps {
  message?: string;
  fullScreen?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * 共通のアイテムプロパティ（DRY原則）
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
 * 共通の検索プロパティ（DRY原則）
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
 * 共通のフィルタープロパティ（DRY原則）
 */
export interface CommonFilterProps {
  filters: Record<string, any>;
  onChange: (filters: Record<string, any>) => void;
  onReset?: () => void;
  className?: string;
}

/**
 * 共通のページネーションプロパティ（DRY原則）
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
