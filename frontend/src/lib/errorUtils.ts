/**
 * Common error handling utilities
 */

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
 * @returns Translation key for error message or null
 */
export function handleApiError(response: Response): string | null {
  if (!response.ok) {
    switch (response.status) {
      case 400:
        return "errors.badRequest";
      case 401:
        return "errors.unauthorized";
      case 403:
        return "errors.forbidden";
      case 404:
        return "errors.notFound";
      case 500:
        return "errors.server";
      default:
        return "errors.generic";
    }
  }
  return null;
}

/**
 * Common function to handle validation errors
 * @param errors - Array of validation errors
 * @returns Joined error messages
 */
export function handleValidationErrors(errors: string[]): string {
  if (errors.length === 0) return "";
  if (errors.length === 1) return errors[0];
  return errors.join(", ");
}
