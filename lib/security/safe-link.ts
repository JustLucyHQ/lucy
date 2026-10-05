// lib/security/safe-link.ts — which link targets we are willing to make clickable in model/user-authored text.
//
// Chat text is untrusted (a model can be prompt-injected, and team chats will be shared). Only web and mail
// links become anchors; javascript:, data:, vbscript:, file:, blob:, relative paths and anything we cannot parse
// are rendered as plain text by the caller.

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** True when `href` is an absolute http(s) or mailto URL. Never throws. */
export function isSafeLinkHref(href: unknown): href is string {
  if (typeof href !== 'string') return false;
  const value = href.trim();
  if (!value) return false;
  try {
    // No base URL: relative references throw, so they are rejected. The WHATWG parser also strips embedded
    // tabs/newlines ("java\nscript:") and lowercases the scheme, so those tricks end up as javascript: here.
    return SAFE_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}
