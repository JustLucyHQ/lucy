/** @type {import('next').NextConfig} */
const nextConfig = {
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
};

module.exports = nextConfig;
