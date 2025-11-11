import { initI18n } from "@/i18n/config";

/**
 * Common error handling utilities
 */

const i18n = initI18n();

/**
 * Common function to handle async errors
 * @param error - Error object
 * @param defaultMessage - Default error message
 * @param onError - Callback function on error
 */
export function handleAsyncError(
  error: unknown,
  defaultMessage: string,
  onError: () => void
): void {
  const errorMessage = error instanceof Error ? error.message : defaultMessage;
    console.error("Async operation failed:", errorMessage);
  onError();
}

/**
 * Common function to handle API error responses
 * @param response - Response object
 * @returns Error message or null
 */
export function handleApiError(response: Response): string | null {
  if (!response.ok) {
    switch (response.status) {
      case 400:
        return i18n.t("errors.badRequest");
      case 401:
        return i18n.t("errors.unauthorized");
      case 403:
        return i18n.t("errors.forbidden");
      case 404:
        return i18n.t("errors.notFound");
      case 500:
        return i18n.t("errors.server");
      default:
        return i18n.t("errors.generic", { status: response.status });
    }
  }
  return null;
}

/**
 * Common function to handle validation errors
 * @param errors - Array of validation errors
 * @returns Error message
 */
export function handleValidationErrors(errors: string[]): string {
  if (errors.length === 0) return "";
  if (errors.length === 1) return errors[0];
  return i18n.t("errors.multiple", { errors: errors.join(", ") });
}
