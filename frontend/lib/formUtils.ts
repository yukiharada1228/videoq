import { initI18n } from "@/i18n/config";

/**
 * Common form processing utilities
 */

const i18n = initI18n();

/**
 * Common form validation function
 * @param data - Data to validate
 * @param rules - Validation rules
 * @returns Validation result
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
 * Common validation functions for form fields
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
 * Function to initialize form data
 * @param initialData - Initial data
 * @returns Initialized form data
 */
export function initializeFormData<T>(initialData: T): T {
  return { ...initialData };
}

/**
 * Function to reset form data
 * @param initialData - Initial data
 * @returns Reset form data
 */
export function resetFormData<T>(initialData: T): T {
  return { ...initialData };
}

/**
 * Function to update form data
 * @param currentData - Current data
 * @param updates - Data to update
 * @returns Updated form data
 */
export function updateFormData<T>(
  currentData: T,
  updates: Partial<T>
): T {
  return { ...currentData, ...updates };
}

/**
 * Function to get form data differences
 * @param originalData - Original data
 * @param currentData - Current data
 * @returns Object containing only changed fields
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
