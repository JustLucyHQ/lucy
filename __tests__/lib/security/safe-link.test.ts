import { isSafeLinkHref } from '@/lib/security/safe-link';

describe('isSafeLinkHref', () => {
  it.each([
    'https://example.com',
    'http://example.com/a?b=c#d',
    'HTTPS://EXAMPLE.COM',
    'mailto:someone@example.com',
    '  https://example.com  ',
  ])('allows %s', (href) => {
    expect(isSafeLinkHref(href)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\nscript:alert(1)',
    ' \tjavascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'blob:https://example.com/abc',
    'tel:+385911196080',
    '/relative/path',
    '//evil.example.com',
    '#anchor',
    'not a url',
    '',
    '   ',
  ])('rejects %j', (href) => {
    expect(isSafeLinkHref(href)).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isSafeLinkHref(undefined)).toBe(false);
    expect(isSafeLinkHref(null)).toBe(false);
    expect(isSafeLinkHref(42)).toBe(false);
  });
});
