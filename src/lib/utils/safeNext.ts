// Whitelist a redirect target read from a `?next=` query parameter.
//
// Open-redirect mitigation: an attacker shouldn't be able to make a
// crafted login link send the user to a hostile origin after auth.
// We accept only same-origin paths and reject anything that smells
// like a scheme, network-prefix URL, or backslash trickery.
//
// Returns the cleaned path (always starts with `/`), or the supplied
// fallback when the input is missing or not safe.

const SAFE_PATH = /^\/[^\\]*$/;

export function safeNext(raw: string | null | undefined, fallback = '/'): string {
  if (!raw) return fallback;
  // `//evil.com/...`, `\\evil.com/...`, `https://evil.com`, `javascript:...`
  if (raw.startsWith('//') || raw.startsWith('\\\\')) return fallback;
  if (raw.includes(':') && !raw.startsWith('/')) return fallback;
  if (!SAFE_PATH.test(raw)) return fallback;
  return raw;
}

/** Encode a same-origin path for use as a `?next=` value. The caller
 *  is responsible for ensuring `path` is local. */
export function encodeNext(path: string): string {
  return encodeURIComponent(path);
}
