// Constant-time secret comparison for the cron-secret gate (issue #36).
//
// A plain `a !== b` short-circuits on the first differing byte, so the response
// time leaks how many leading bytes matched — in theory a timing side-channel
// could recover the secret byte-by-byte. We hash both inputs to fixed-length
// SHA-256 digests (so the compare loop length never depends on the secret) and
// accumulate the XOR of every byte with no early exit. SHA-256 preimage
// resistance means a digest match implies the raw inputs matched.
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ah, bh] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const av = new Uint8Array(ah);
  const bv = new Uint8Array(bh);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}
