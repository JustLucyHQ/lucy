#!/usr/bin/env bash
# Deploy the current committed HEAD to web04: full source sync + remote build.
#
#   bash scripts/deploy-web04.sh
#
# Syncs the tracked source (git archive HEAD) over the server's app dir, leaving
# untracked files (.env.local, node_modules, .next) in place, then builds +
# restarts pm2 via scripts/web04-build.sh. Commit first — this deploys HEAD.
#
# Config via env (defaults target the justlucy.ai host):
#   WEB04_KEY  ssh key path        (default: ~/.ssh/claude_web04)
#   WEB04_HOST user@host           (default: root@94.130.55.76)
#   WEB04_PORT ssh port            (default: 9091)
#   WEB04_APP  remote app dir      (default: /home/justlucy/htdocs/justlucy.ai)
set -euo pipefail

KEY="${WEB04_KEY:-$HOME/.ssh/claude_web04}"
HOST="${WEB04_HOST:-root@94.130.55.76}"
PORT="${WEB04_PORT:-9091}"
APP="${WEB04_APP:-/home/justlucy/htdocs/justlucy.ai}"
SSH=(ssh -i "$KEY" -p "$PORT" -o StrictHostKeyChecking=no "$HOST")

echo "==> archiving committed HEAD ($(git rev-parse --short HEAD))"
git archive --format=tar.gz -o /tmp/lucy_src.tgz HEAD

echo "==> uploading source to $HOST:$APP"
scp -i "$KEY" -P "$PORT" /tmp/lucy_src.tgz "$HOST:/tmp/lucy_src.tgz"

echo "==> extracting (preserves .env.local / node_modules / .next) + building"
"${SSH[@]}" "cd '$APP' && tar xzf /tmp/lucy_src.tgz && bash scripts/web04-build.sh"

echo "==> deployed."
