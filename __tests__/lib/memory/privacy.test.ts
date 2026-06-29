import { containsSecret, redactSecrets } from '@/lib/memory/privacy';

describe('privacy guard', () => {
  it('flags an OpenAI-style key', () => {
    expect(containsSecret('my key is sk-abcdef0123456789abcdef0123456789')).toBe(true);
  });
  it('flags an email + password phrase', () => {
    expect(containsSecret('password: hunter2')).toBe(true);
  });
  it('does not flag ordinary text', () => {
    expect(containsSecret('I prefer TypeScript and dark mode')).toBe(false);
  });
  it('redacts a detected secret', () => {
    expect(redactSecrets('token sk-abcdef0123456789abcdef0123456789 here'))
      .toContain('[REDACTED]');
  });
});
