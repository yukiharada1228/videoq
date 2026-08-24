/**
 * Common configuration for authentication forms
 * Centralized management of duplicate field definitions
 */

/**
 * Must stay in sync with the backend rule
 * (`emailAndPassword.minPasswordLength` in apps/api/src/lib/auth.ts).
 * A lower value here only produces a server-side rejection after submit.
 */
export const PASSWORD_MIN_LENGTH = 12;

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
    minLength: PASSWORD_MIN_LENGTH,
  } as FormFieldConfig,

  CONFIRM_PASSWORD: {
    id: 'confirmPassword',
    name: 'confirmPassword',
    type: 'password',
    labelKey: 'auth.fields.passwordConfirmation.label',
    minLength: PASSWORD_MIN_LENGTH,
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
  '/consent',
  '/device',
  '/share',
  '/course-invitations',
  '/docs',
  '/pricing',
  '/terms',
  '/privacy',
  '/refund',
  '/legal',
] as const;

export function isPublicAuthPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
