/**
 * Common configuration for authentication forms
 * Centralized management of duplicate field definitions following DRY principle
 */

export interface FormFieldConfig {
  id: string;
  name: string;
  type: string;
  labelKey: string;
  placeholderKey: string;
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
    placeholderKey: 'auth.fields.email.placeholder',
  } as FormFieldConfig,

  USERNAME: {
    id: 'username',
    name: 'username',
    type: 'text',
    labelKey: 'auth.fields.username.label',
    placeholderKey: 'auth.fields.username.placeholder',
  } as FormFieldConfig,

  PASSWORD: {
    id: 'password',
    name: 'password',
    type: 'password',
    labelKey: 'auth.fields.password.label',
    placeholderKey: 'auth.fields.password.placeholder',
  } as FormFieldConfig,

  PASSWORD_WITH_MIN_LENGTH: {
    id: 'password',
    name: 'password',
    type: 'password',
    labelKey: 'auth.fields.password.label',
    placeholderKey: 'auth.fields.password.placeholder',
    minLength: 8,
  } as FormFieldConfig,

  CONFIRM_PASSWORD: {
    id: 'confirmPassword',
    name: 'confirmPassword',
    type: 'password',
    labelKey: 'auth.fields.passwordConfirmation.label',
    placeholderKey: 'auth.fields.passwordConfirmation.placeholder',
    minLength: 8,
  } as FormFieldConfig,
} as const;

