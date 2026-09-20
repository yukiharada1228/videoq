const VALIDATION_ORIGIN = 'https://auth-redirect.invalid';

/** Accept only root-relative paths that remain on the same origin in a browser. */
export function getSafeNextPath(next: string | null): string | null {
  if (!next?.startsWith('/') || next.startsWith('//')) return null;
  // URL parsing removes tabs/newlines and treats backslashes as slashes.
  if (/[\\\t\r\n]/.test(next)) return null;

  try {
    if (new URL(next, VALIDATION_ORIGIN).origin !== VALIDATION_ORIGIN) return null;
    // Preserve the original path: serializing a path such as /.//example.com
    // into //example.com would turn it into a cross-origin navigation.
    return next;
  } catch {
    return null;
  }
}
