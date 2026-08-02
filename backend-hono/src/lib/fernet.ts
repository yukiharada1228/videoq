import type { Bindings } from "../types/bindings";

/**
 * Django 側 `FernetCipher`（`infrastructure/common/cipher.py`）互換の対称暗号。
 * SearchAPI キーは `app_user.searchapi_api_key_encrypted`（bytea）に Fernet token の
 * ASCII バイト列として保存されており、Worker と Django が相互に読める必要がある。
 *
 * 鍵: PBKDF2-HMAC-SHA256(SECRET_KEY, "videoq-user-secret-key", 480000, 32 bytes)
 *     → 前半 16 byte が HMAC 署名鍵、後半 16 byte が AES-128-CBC 鍵。
 * token: base64url( 0x80 | ts(8, BE) | iv(16) | AES-128-CBC(PKCS7) | HMAC-SHA256(32) )
 */
const SALT = "videoq-user-secret-key";
const ITERATIONS = 480_000;
const VERSION = 0x80;

type FernetKeys = { signing: CryptoKey; encryption: CryptoKey };

async function deriveKeys(env: Bindings): Promise<FernetKeys> {
  if (!env.JWT_SECRET) throw new Error("JWT_SECRET is not configured"); // = Django SECRET_KEY
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(env.JWT_SECRET), "PBKDF2", false, [
    "deriveBits",
  ]);
  const dk = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: enc.encode(SALT), iterations: ITERATIONS, hash: "SHA-256" },
      base,
      256,
    ),
  );
  const [signing, encryption] = await Promise.all([
    crypto.subtle.importKey("raw", dk.slice(0, 16), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
      "verify",
    ]),
    crypto.subtle.importKey("raw", dk.slice(16, 32), { name: "AES-CBC" }, false, [
      "encrypt",
      "decrypt",
    ]),
  ]);
  return { signing, encryption };
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_"); // Fernet は "=" パディングを残す
}

function fromBase64Url(token: string): Uint8Array {
  let b64 = token.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** Fernet token を生成（Python `Fernet.encrypt` と同形式）。 */
export async function fernetEncrypt(
  env: Bindings,
  plaintext: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  iv: Uint8Array = crypto.getRandomValues(new Uint8Array(16)),
): Promise<string> {
  const { signing, encryption } = await deriveKeys(env);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-CBC", iv }, // WebCrypto の AES-CBC は PKCS7 パディング
      encryption,
      new TextEncoder().encode(plaintext),
    ),
  );

  const body = new Uint8Array(1 + 8 + 16 + ciphertext.length);
  body[0] = VERSION;
  new DataView(body.buffer).setBigUint64(1, BigInt(nowSec), false);
  body.set(iv, 9);
  body.set(ciphertext, 25);

  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", signing, body));
  const token = new Uint8Array(body.length + 32);
  token.set(body);
  token.set(mac, body.length);
  return toBase64Url(token);
}

/** Fernet token を復号（HMAC 不一致・形式不正は null。ttl は Django 側も未使用）。 */
export async function fernetDecrypt(env: Bindings, token: string): Promise<string | null> {
  let raw: Uint8Array;
  try {
    raw = fromBase64Url(token);
  } catch {
    return null;
  }
  if (raw.length < 1 + 8 + 16 + 32 || raw[0] !== VERSION) return null;

  const { signing, encryption } = await deriveKeys(env);
  const body = raw.subarray(0, raw.length - 32);
  const mac = raw.subarray(raw.length - 32);
  if (!(await crypto.subtle.verify("HMAC", signing, mac, body))) return null;

  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv: body.subarray(9, 25) },
      encryption,
      body.subarray(25),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null; // パディング不正など
  }
}
