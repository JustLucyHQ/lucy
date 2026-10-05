/** @jest-environment node */
// electron/url-policy.js is plain CommonJS (loaded by the Electron main process), so it is required here.
const { isSafeExternalUrl, isAppUrl } = require('../../electron/url-policy') as {
  isSafeExternalUrl: (url: unknown) => boolean;
  isAppUrl: (url: unknown, appUrl: unknown) => boolean;
};

describe('isSafeExternalUrl (what shell.openExternal may receive)', () => {
  it.each(['https://example.com', 'http://example.com/x?y=1', 'mailto:a@example.com'])('allows %s', (u) => {
    expect(isSafeExternalUrl(u)).toBe(true);
  });

  it.each([
    'file:///C:/Windows/System32/calc.exe',
    'smb://attacker/share',
    'ms-msdt:/id PCWDiagnostic',
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    'vscode://file/c:/x',
    'ftp://example.com',
    'C:\\Windows\\System32\\calc.exe',
    '/relative',
    '',
    undefined,
    null,
  ])('blocks %j', (u) => {
    expect(isSafeExternalUrl(u)).toBe(false);
  });
});

describe('isAppUrl (stay in the window only for our own local server)', () => {
  const app = 'http://127.0.0.1:41234';

  it('accepts same-origin URLs', () => {
    expect(isAppUrl('http://127.0.0.1:41234/chat', app)).toBe(true);
    expect(isAppUrl('http://127.0.0.1:41234/', app)).toBe(true);
  });

  it.each([
    'http://127.0.0.1:41235/chat', // other port
    'https://127.0.0.1:41234/chat', // other scheme
    'http://localhost:41234/chat', // other host
    'http://127.0.0.1:41234.evil.example/chat',
    'https://justlucy.ai/chat',
    'data:text/html,hi', // opaque origin
    'file:///etc/passwd',
    'not a url',
  ])('rejects %s', (u) => {
    expect(isAppUrl(u, app)).toBe(false);
  });

  it('rejects everything when the app URL is unknown', () => {
    expect(isAppUrl('http://127.0.0.1:41234/chat', null)).toBe(false);
  });
});
