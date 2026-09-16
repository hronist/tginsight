export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let out = "";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

/** Stable key for embedding reuse across rebuilds. */
export async function embeddingContentHash(
  modelKey: string,
  chunkerVersion: string,
  text: string,
): Promise<string> {
  return sha256Hex(`${modelKey}\0${chunkerVersion}\0${text}`);
}
