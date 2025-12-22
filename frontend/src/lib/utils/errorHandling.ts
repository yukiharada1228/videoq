/**
 * Common error handling function
 * @param err - Error object
 * @param defaultMessage - Default error message
 * @param setError - Function to set error message
 */
export const handleAsyncError = (
  err: unknown, 
  defaultMessage: string, 
  setError: (msg: string) => void
): void => {
  const errorMessage = err instanceof Error && err.message ? err.message : defaultMessage;
  setError(errorMessage);
  console.error(defaultMessage, err);
};

