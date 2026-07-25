/**
 * Common configuration for authentication forms
 * Centralized management of duplicate field definitions
 */

export interface FormFieldConfig {
  id: string;
  name: string;
  type: string;
  labelKey: string;
  minLength?: number;
}

/**
 * Field definitions commonly used in authentication forms
 */
export const AUTH_FIELDS = {
  EMAIL: {
    id: 'email',
    name: 'email',
    type: 'email',
    labelKey: 'auth.fields.email.label',
  } as FormFieldConfig,

  USERNAME: {
    id: 'username',
    name: 'username',
    type: 'text',
    labelKey: 'auth.fields.username.label',
  } as FormFieldConfig,

  PASSWORD: {
    id: 'password',
    name: 'password',
    type: 'password',
    labelKey: 'auth.fields.password.label',
  } as FormFieldConfig,

  PASSWORD_WITH_MIN_LENGTH: {
    id: 'password',
    name: 'password',
    type: 'password',
    labelKey: 'auth.fields.password.label',
    minLength: 8,
  } as FormFieldConfig,

  CONFIRM_PASSWORD: {
    id: 'confirmPassword',
    name: 'confirmPassword',
    type: 'password',
    labelKey: 'auth.fields.passwordConfirmation.label',
    minLength: 8,
  } as FormFieldConfig,
} as const;

export const PUBLIC_AUTH_PATHS = [
  '/login',
  '/signup',
  '/signup/check-email',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/change-email',
  '/share',
  '/docs',
] as const;

export function isPublicAuthPath(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.some((path) => pathname.startsWith(path));
}
