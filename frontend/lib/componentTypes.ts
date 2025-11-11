/**
 * Common component patterns
 */

import React from 'react';

/**
 * Common button properties
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
 * Common card properties
 */
export interface CommonCardProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
  onClick?: () => void;
}

/**
 * Common modal properties
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
 * Common form properties
 */
export interface CommonFormProps<T = unknown> {
  onSubmit: (data: T) => void;
  children: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  className?: string;
}

/**
 * Common list properties
 */
export interface CommonListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  emptyMessage?: string;
  loading?: boolean;
  className?: string;
}

/**
 * Common page properties
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
 * Common alert properties
 */
export interface CommonAlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  onClose?: () => void;
  className?: string;
}

/**
 * Common loading properties
 */
export interface CommonLoadingProps {
  message?: string;
  fullScreen?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Common item properties
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
 * Common search properties
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
 * Common filter properties
 */
export interface CommonFilterProps<T = unknown> {
  filters: Record<string, T>;
  onChange: (filters: Record<string, T>) => void;
  onReset?: () => void;
  className?: string;
}

/**
 * Common pagination properties
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
