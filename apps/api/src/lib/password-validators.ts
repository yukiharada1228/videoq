import { COMMON_PASSWORDS } from "./common-passwords";

/**
 * Django AUTH_PASSWORD_VALIDATORS 相当（settings の 4 つ）。
 * ただし serializer は validate_password(value)（user 無し）で呼ぶため
 * UserAttributeSimilarityValidator は no-op。実行順は MinLength → Common → Numeric。
 * 返り値は全エラーメッセージの配列（空なら妥当）。
 */
const MIN_LENGTH = 8;

export function validateDjangoPassword(password: string): string[] {
  const errors: string[] = [];

  // MinimumLengthValidator（len はコードポイント数 = Python len と一致）
  if ([...password].length < MIN_LENGTH) {
    errors.push(
      `This password is too short. It must contain at least ${MIN_LENGTH} characters.`,
    );
  }

  // CommonPasswordValidator: password.lower().strip() が一覧にあれば
  if (COMMON_PASSWORDS.has(password.toLowerCase().trim())) {
    errors.push("This password is too common.");
  }

  // NumericPasswordValidator: password.isdigit()
  if (/^\d+$/.test(password)) {
    errors.push("This password is entirely numeric.");
  }

  return errors;
}
