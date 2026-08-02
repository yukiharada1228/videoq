/**
 * Django パスワードハッシュ検証（pbkdf2_sha256）。
 * 形式: `pbkdf2_sha256$<iterations>$<salt>$<b64(hash)>`。
 * Django PBKDF2PasswordHasher.verify と同じく再計算して定数時間比較する。
 */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin); // 標準 base64（+/ と = パディング）= Django b64encode と一致
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Django PBKDF2PasswordHasher の現行既定（実 DB のハッシュも 1200000）。
const PBKDF2_ITERATIONS = 1200000;
// get_random_string の既定 allowed_chars（ascii_letters + digits, 62）。
const SALT_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// Django BasePasswordHasher.salt(): ceil(salt_entropy=128 / log2(62)) = 22 文字。
const SALT_LENGTH = 22;

/** Django のソルト生成相当（128bit エントロピー = 62 文字集合で 22 桁・バイアス回避）。 */
function generateSalt(length = SALT_LENGTH): string {
  const n = SALT_CHARS.length;
  const limit = Math.floor(256 / n) * n;
  let out = "";
  while (out.length < length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length && out.length < length; i += 1) {
      if (bytes[i] < limit) out += SALT_CHARS[bytes[i] % n];
    }
  }
  return out;
}

async function pbkdf2Base64(
  password: string,
  salt: string,
  iterations: number,
): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

/**
 * Django make_password 相当（pbkdf2_sha256）。返り値は
 * `pbkdf2_sha256$<iterations>$<salt>$<b64hash>`。Django check_password が受理する。
 */
export async function hashDjangoPassword(password: string): Promise<string> {
  const salt = generateSalt();
  const hash = await pbkdf2Base64(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

/** encoded が正しい password のハッシュなら true。pbkdf2_sha256 のみ対応。 */
export async function verifyDjangoPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 4) return false;
  const [algorithm, iterStr, salt, hash] = parts;
  if (algorithm !== "pbkdf2_sha256") return false; // 他方式は未対応（実 DB は全て pbkdf2_sha256）

  // Django の int() は数字のみ受理（"1200000junk" は不可）。厳密に検証する。
  if (!/^\d+$/.test(iterStr)) return false;
  const iterations = Number.parseInt(iterStr, 10);
  if (!Number.isSafeInteger(iterations) || iterations <= 0) return false;

  const computed = await pbkdf2Base64(password, salt, iterations);
  return constantTimeEqual(computed, hash);
}
