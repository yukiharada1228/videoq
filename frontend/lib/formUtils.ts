import { initI18n } from "@/i18n/config";

/**
 * 共通のフォーム処理ユーティリティ
 */

const i18n = initI18n();

/**
 * フォームバリデーションの共通関数
 * @param data - バリデーションするデータ
 * @param rules - バリデーションルール
 * @returns バリデーション結果
 */
export function validateForm<T>(
  data: T,
  rules: Partial<Record<keyof T, (value: T[keyof T]) => string | null>>
): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  
  for (const [field, validator] of Object.entries(rules)) {
    if (validator && typeof validator === 'function') {
      const error = validator(data[field as keyof T]);
      if (error) {
        errors[field] = error;
      }
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * フォームフィールドの共通バリデーション関数
 */
export const formValidators = {
  required: (value: unknown): string | null => {
    if (
      value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim() === '')
    ) {
      return i18n.t("validation.required");
    }
    return null;
  },
  
  email: (value: string): string | null => {
    if (!value) return null;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return i18n.t("validation.email");
    }
    return null;
  },
  
  minLength: (min: number) => (value: string): string | null => {
    if (!value) return null;
    if (value.length < min) {
      return i18n.t("validation.minLength", { min });
    }
    return null;
  },
  
  maxLength: (max: number) => (value: string): string | null => {
    if (!value) return null;
    if (value.length > max) {
      return i18n.t("validation.maxLength", { max });
    }
    return null;
  },
  
  fileSize: (maxSizeMB: number) => (file?: File | null): string | null => {
    if (!file) return null;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return i18n.t("validation.fileSize", { max: maxSizeMB });
    }
    return null;
  },
  
  fileType: (allowedTypes: string[]) => (file?: File | null): string | null => {
    if (!file) return null;
    if (!allowedTypes.includes(file.type)) {
      return i18n.t("validation.fileType", {
        types: allowedTypes.join(", "),
      });
    }
    return null;
  },
};

/**
 * フォームデータの初期化関数
 * @param initialData - 初期データ
 * @returns 初期化されたフォームデータ
 */
export function initializeFormData<T>(initialData: T): T {
  return { ...initialData };
}

/**
 * フォームデータのリセット関数
 * @param initialData - 初期データ
 * @returns リセットされたフォームデータ
 */
export function resetFormData<T>(initialData: T): T {
  return { ...initialData };
}

/**
 * フォームデータの更新関数
 * @param currentData - 現在のデータ
 * @param updates - 更新するデータ
 * @returns 更新されたフォームデータ
 */
export function updateFormData<T>(
  currentData: T,
  updates: Partial<T>
): T {
  return { ...currentData, ...updates };
}

/**
 * フォームデータの差分取得関数
 * @param originalData - 元のデータ
 * @param currentData - 現在のデータ
 * @returns 変更されたフィールドのみのオブジェクト
 */
export function getFormDataChanges<T>(
  originalData: T,
  currentData: T
): Partial<T> {
  const changes: Partial<T> = {};
  
  for (const key in currentData) {
    if (currentData[key] !== originalData[key]) {
      changes[key] = currentData[key];
    }
  }
  
  return changes;
}
