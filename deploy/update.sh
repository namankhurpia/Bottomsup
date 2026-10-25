#!/usr/bin/env bash
# Pull the latest code, rebuild, restart. Scores in /var/lib/toot-raft are untouched.
# Run from the project folder on the server: bash deploy/update.sh
set -euo pipefail
export PATH="/usr/local/bin:$PATH"
cd "$(dirname "$0")/.."
if [[ -d .git ]]; then git pull --ff-only; fi
npm ci
npm run build
sudo systemctl restart toot-raft
sleep 2
curl -fsS http://127.0.0.1:"$(systemctl show toot-raft -p Environment --value | tr ' ' '\n' | sed -n 's/^PORT=//p')"/api/health && echo " <- healthy"
