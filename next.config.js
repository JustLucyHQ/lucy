// The Supabase project's public REST/Auth host — the browser talks to it
// directly (client-side auth, provider-key CRUD), so connect-src must allow it.
const SUPABASE_CONNECT_SRC = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

// 'unsafe-eval' is needed ONLY by `next dev` (React/Turbopack rebuild call stacks with eval). Production never
// needs it, and keeping it would let any injected string become code. Workflow Code nodes run server-side only
// (lib/workflow/engine.ts), so nothing in the production client uses eval / new Function.
// Read at call time (not module load) so the policy can be unit-tested for both modes.
const scriptEval = () => (process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '');

function csp(frameAncestors) {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${scriptEval()}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    `connect-src 'self'${SUPABASE_CONNECT_SRC ? ` ${SUPABASE_CONNECT_SRC}` : ''}`,
    `frame-ancestors ${frameAncestors}`,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

const BASE_SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 16.3+ `next dev` appends its own block to CLAUDE.md on every start — our instruction files stay ours.
  agentRules: false,
  output: 'standalone',
  transpilePackages: [
    'react-markdown',
    'remark-gfm',
    'rehype-highlight',
  ],
  serverExternalPackages: ['@anthropic-ai/sdk', 'openai', 'grammy'],
  // Docs pages read markdown from docs/kb at runtime — include them in the
  // standalone output trace so Docker builds ship the content.
  outputFileTracingIncludes: {
    '/docs/[[...slug]]': ['./docs/kb/**/*'],
  },
  async headers() {
    return [
      {
        // Everything except /embed: same-origin framing only.
        source: '/:path((?!embed$).*)',
        headers: [
          ...BASE_SECURITY_HEADERS,
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: csp("'self'") },
        ],
      },
      {
        // /embed is meant to be iframed on arbitrary customer sites — no
        // X-Frame-Options (it has no "allow all" value), CSP allows any framer.
        source: '/embed',
        headers: [
          ...BASE_SECURITY_HEADERS,
          { key: 'Content-Security-Policy', value: csp('*') },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
