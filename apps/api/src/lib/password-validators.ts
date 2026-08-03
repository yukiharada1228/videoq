const MIN_LENGTH = 12;
const MAX_LENGTH = 128;

/** Application password policy. Error codes are stable API-facing values. */
export function validatePassword(password: string): string[] {
  const errors: string[] = [];

  if ([...password].length < MIN_LENGTH) {
    errors.push(`Password must contain at least ${MIN_LENGTH} characters.`);
  }
  if ([...password].length > MAX_LENGTH) {
    errors.push(`Password must contain at most ${MAX_LENGTH} characters.`);
  }
  if (/^\d+$/.test(password)) {
    errors.push("Password cannot contain only numbers.");
  }
  return errors;
}
