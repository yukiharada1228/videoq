/** SHA-256 の16進ダイジェスト（Django `hashlib.sha256(x).hexdigest()` と一致, PoC #03）。 */
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
