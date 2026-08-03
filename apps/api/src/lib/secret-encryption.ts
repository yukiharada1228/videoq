import type { Bindings } from "../types/bindings";

function decodeBase64Url(value: string): Uint8Array {
  let b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const binary = atob(b64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function encryptionKey(env: Bindings): Promise<CryptoKey> {
  const bytes = decodeBase64Url(env.USER_SECRET_ENCRYPTION_KEY);
  if (bytes.length !== 32) {
    throw new Error("USER_SECRET_ENCRYPTION_KEY must contain 32 base64url bytes");
  }
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/** `v1.<nonce>.<ciphertext+tag>` AES-256-GCM envelope. */
export async function encryptUserSecret(
  env: Bindings,
  plaintext: string,
): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      await encryptionKey(env),
      new TextEncoder().encode(plaintext),
    ),
  );
  return `v1.${encodeBase64Url(nonce)}.${encodeBase64Url(ciphertext)}`;
}

export async function decryptUserSecret(
  env: Bindings,
  envelope: string,
): Promise<string | null> {
  const [version, nonceText, ciphertextText] = envelope.split(".");
  if (version !== "v1" || !nonceText || !ciphertextText) return null;
  try {
    const nonce = decodeBase64Url(nonceText);
    const ciphertext = decodeBase64Url(ciphertextText);
    if (nonce.length !== 12 || ciphertext.length < 17) return null;
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      await encryptionKey(env),
      ciphertext,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}
