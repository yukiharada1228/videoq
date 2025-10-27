/**
 * 認証フォームの共通設定
 * DRY原則に従って、重複するフィールド定義を一元管理
 */

export interface FormFieldConfig {
  id: string;
  name: string;
  label: string;
  type: string;
  placeholder: string;
  minLength?: number;
}

/**
 * 認証フォームで共通使用されるフィールド定義
 */
export const AUTH_FIELDS = {
  USERNAME: {
    id: 'username',
    name: 'username',
    label: 'ユーザー名',
    type: 'text',
    placeholder: 'ユーザー名を入力',
  } as FormFieldConfig,

  PASSWORD: {
    id: 'password',
    name: 'password',
    label: 'パスワード',
    type: 'password',
    placeholder: 'パスワードを入力',
  } as FormFieldConfig,

  PASSWORD_WITH_MIN_LENGTH: {
    id: 'password',
    name: 'password',
    label: 'パスワード',
    type: 'password',
    placeholder: 'パスワードを入力',
    minLength: 8,
  } as FormFieldConfig,

  CONFIRM_PASSWORD: {
    id: 'confirmPassword',
    name: 'confirmPassword',
    label: 'パスワード（確認）',
    type: 'password',
    placeholder: 'パスワードを再入力',
    minLength: 8,
  } as FormFieldConfig,
} as const;

