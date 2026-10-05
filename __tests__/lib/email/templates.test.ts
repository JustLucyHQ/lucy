import { renderEmail, type TemplateKey } from '@/lib/email/templates';
import { esc } from '@/lib/security/escape-html';

const KEYS: TemplateKey[] = ['passwordReset', 'twoFactorCode', 'signupConfirm'];

describe('esc', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(esc(`<a href="x" onclick='y'>&`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;');
  });
  it('coerces numbers and treats null/undefined as empty', () => {
    expect(esc(15)).toBe('15');
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

describe('renderEmail HTML escaping', () => {
  const evil = '<img src=x onerror=alert(1)>"\'&';

  it.each(KEYS)('%s escapes firstName and code in the HTML part', (key) => {
    const { html } = renderEmail(key, { firstName: evil, code: evil, expiresMinutes: 10 });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;');
  });

  it.each(KEYS)('%s keeps a normal name and code readable', (key) => {
    const { html, text } = renderEmail(key, { firstName: 'Mia', code: '123456', expiresMinutes: 10 });
    expect(html).toContain('Hi Mia');
    expect(html).toContain('123456');
    expect(html).toContain('10 minutes');
    expect(text).toContain('Hi Mia');
  });

  it('leaves the plain-text part unescaped (it is not HTML)', () => {
    const { text } = renderEmail('twoFactorCode', { firstName: 'A&B', code: '1', expiresMinutes: 5 });
    expect(text).toContain('Hi A&B');
  });
});
