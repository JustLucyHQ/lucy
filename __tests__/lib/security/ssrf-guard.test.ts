import { isPrivateHost, assertPublicHttpUrl } from '@/lib/security/ssrf-guard';

describe('isPrivateHost', () => {
  it.each([
    'localhost', '127.0.0.1', '10.10.10.254', '192.168.1.1', '169.254.169.254',
    '172.16.0.1', '172.31.255.255', '0.0.0.0', '::1', 'foo.internal', 'foo.local',
  ])('flags %s as private', (h) => {
    expect(isPrivateHost(h)).toBe(true);
  });

  it.each(['example.com', 'api.contractorsroom.com', '8.8.8.8', '172.32.0.1', '172.15.0.1'])(
    'allows %s as public',
    (h) => {
      expect(isPrivateHost(h)).toBe(false);
    },
  );
});

describe('assertPublicHttpUrl', () => {
  it('allows a normal public https URL', () => {
    expect(() => assertPublicHttpUrl('https://example.com/mcp')).not.toThrow();
  });

  it('rejects the internal Supabase Kong URL', () => {
    expect(() => assertPublicHttpUrl('http://10.10.10.254:8000')).toThrow(/private\/internal/);
  });

  it('rejects localhost', () => {
    expect(() => assertPublicHttpUrl('http://localhost:11434')).toThrow(/private\/internal/);
  });

  it('rejects a cloud metadata address', () => {
    expect(() => assertPublicHttpUrl('http://169.254.169.254/latest/meta-data')).toThrow(/private\/internal/);
  });

  it('rejects a non-http(s) scheme', () => {
    expect(() => assertPublicHttpUrl('file:///etc/passwd')).toThrow(/only http\(s\)/);
  });

  it('rejects a malformed URL', () => {
    expect(() => assertPublicHttpUrl('not a url')).toThrow(/invalid URL/);
  });
});
