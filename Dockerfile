# syntax=docker/dockerfile:1
#
# Lucy production image — Next.js 16 with output: 'standalone'.
#
# IMPORTANT: NEXT_PUBLIC_* values are inlined into the client bundle at BUILD
# time, not read at runtime. They must be passed as --build-arg:
#   • Omit the Supabase args  → local-first image (standalone mode, no login).
#   • Pass the Supabase args   → connected/cloud image (Supabase auth + Postgres).
# Server-only secrets (SUPABASE_SERVICE_ROLE_KEY, SMTP_*, provider keys) are read
# at runtime — supply them as container env, never bake them into the image.
#
# Build (cloud):
#   docker build \
#     --build-arg NEXT_PUBLIC_SITE_URL=https://justlucy.ai \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co \
#     --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... \
#     -t lucy .
# Build (local-first): docker build -t lucy-local .

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat

# ── deps: full install (dev deps are required to run `next build`) ────────────
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── builder ───────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time public config (empty Supabase args ⇒ local-first build).
ARG NEXT_PUBLIC_SITE_URL=https://justlucy.ai
ARG NEXT_PUBLIC_SUPABASE_URL=
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── runner: minimal standalone image ─────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# The standalone output bundles its own minimal node_modules + server.js, so the
# runner needs no `npm install`. public/ and .next/static are served alongside.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
