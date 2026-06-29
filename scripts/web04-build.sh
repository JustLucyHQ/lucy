#!/usr/bin/env bash
# Build Lucy + restart the pm2 process. Run ON the server from the app dir
# (e.g. /home/justlucy/htdocs/justlucy.ai): `bash scripts/web04-build.sh`.
# Produces the Next standalone bundle and copies static+public into it.
# Next auto-loads .env.local for the build (NEXT_PUBLIC_* are inlined at build time).
set -e
cd "$(dirname "$0")/.."

# Root node_modules may be pruned post-build to save disk; restore if missing.
[ -d node_modules ] || npm ci

npm run build

# The standalone server doesn't include static assets / public — copy them in.
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

pm2 restart justlucy
echo "DEPLOY_OK"
