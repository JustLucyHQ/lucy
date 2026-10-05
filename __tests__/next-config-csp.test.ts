/** @jest-environment node */
// Security headers from next.config.js: no 'unsafe-eval' in production, /embed framing rules unchanged.
const nextConfig = require('../next.config.js') as {
  headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]>;
};

type Env = { NODE_ENV?: string };
const env = process.env as Env;

async function cspFor(source: string, nodeEnv: string): Promise<string> {
  const prev = env.NODE_ENV;
  env.NODE_ENV = nodeEnv;
  try {
    const rules = await nextConfig.headers();
    const rule = rules.find((r) => r.source === source)!;
    return rule.headers.find((h) => h.key === 'Content-Security-Policy')!.value;
  } finally {
    env.NODE_ENV = prev;
  }
}

const MAIN = '/:path((?!embed$).*)';

describe('Content-Security-Policy', () => {
  it.each(['production', 'test'])("has no 'unsafe-eval' when NODE_ENV=%s", async (mode) => {
    expect(await cspFor(MAIN, mode)).not.toContain('unsafe-eval');
    expect(await cspFor('/embed', mode)).not.toContain('unsafe-eval');
  });

  it("allows 'unsafe-eval' only in `next dev`", async () => {
    expect(await cspFor(MAIN, 'development')).toContain("'unsafe-eval'");
  });

  it('keeps the other directives (img-src, object-src, framing rules)', async () => {
    const main = await cspFor(MAIN, 'production');
    expect(main).toContain("img-src 'self' data:");
    expect(main).toContain("object-src 'none'");
    expect(main).toContain("frame-ancestors 'self'");
    expect(main).toContain("script-src 'self' 'unsafe-inline'");
    const embed = await cspFor('/embed', 'production');
    expect(embed).toContain('frame-ancestors *');
    expect(embed).toContain("object-src 'none'");
  });
});
