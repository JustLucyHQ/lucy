// Pure URL policy for the Electron main process (no electron imports, so it is unit-testable).
//
// The window must only ever show the bundled local server. Anything else (links in chat text, window.open,
// redirects) goes to the system browser — and only for web/mail schemes: shell.openExternal hands a URL to the
// OS, so file:, smb:, ms-msdt: and other custom protocol handlers must never reach it.

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** Parse a URL, or return null. */
function parse(url) {
  try {
    return new URL(String(url));
  } catch {
    return null;
  }
}

/** True when the OS may be asked to open this URL (http, https, mailto only). */
function isSafeExternalUrl(url) {
  const u = parse(url);
  return !!u && EXTERNAL_PROTOCOLS.has(u.protocol);
}

/** True when `url` is on the same origin as the app's own local server (`appUrl`). */
function isAppUrl(url, appUrl) {
  const u = parse(url);
  const app = parse(appUrl);
  if (!u || !app || u.origin === 'null') return false;
  return u.origin === app.origin;
}

module.exports = { isSafeExternalUrl, isAppUrl, EXTERNAL_PROTOCOLS };
