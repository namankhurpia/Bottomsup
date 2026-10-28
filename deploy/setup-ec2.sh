#!/usr/bin/env bash
# One-time setup on a fresh EC2 instance (Amazon Linux 2023 or Ubuntu; x86_64 or arm64).
# Run from inside the project folder on the server:
#     sudo bash deploy/setup-ec2.sh
# It installs Node 24 (official build, checksum-verified), builds the game, and runs it as a
# systemd service on port 80 that restarts on crash and on reboot. Scores live in
# /var/lib/toot-raft, outside the code folder, so redeploys never touch them.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_USER="${SUDO_USER:-$(whoami)}"
DATA_DIR=/var/lib/toot-raft
PORT="${PORT:-80}"
NODE_MAJOR=24
# sudo on Amazon Linux drops /usr/local/bin from PATH; that's where Node gets installed
export PATH="/usr/local/bin:$PATH"

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo bash deploy/setup-ec2.sh" >&2
  exit 1
fi

echo "==> Node.js"
if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]]; then
  case "$(uname -m)" in
    x86_64) ARCH=x64 ;;
    aarch64 | arm64) ARCH=arm64 ;;
    *) echo "Unsupported CPU: $(uname -m)" >&2; exit 1 ;;
  esac
  command -v xz >/dev/null || { command -v dnf >/dev/null && dnf install -y xz || apt-get install -y xz-utils; }
  BASE="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x"
  TMP="$(mktemp -d)"
  curl -fsSL "$BASE/SHASUMS256.txt" -o "$TMP/SHASUMS256.txt"
  FILE="$(grep -o "node-v[0-9.]*-linux-${ARCH}\.tar\.xz" "$TMP/SHASUMS256.txt" | head -n1)"
  curl -fsSL "$BASE/$FILE" -o "$TMP/$FILE"
  (cd "$TMP" && grep " $FILE\$" SHASUMS256.txt | sha256sum -c -)
  tar -xJf "$TMP/$FILE" -C /usr/local --strip-components=1
  rm -rf "$TMP"
fi
echo "node $(node -v), npm $(npm -v)"

echo "==> Build"
cd "$APP_DIR"
sudo -u "$APP_USER" env PATH="$PATH" npm ci
sudo -u "$APP_USER" env PATH="$PATH" npm run build

echo "==> Data folder $DATA_DIR"
mkdir -p "$DATA_DIR"
chown "$APP_USER" "$DATA_DIR"

echo "==> systemd service"
sed -e "s|@APP_DIR@|$APP_DIR|g" -e "s|@APP_USER@|$APP_USER|g" -e "s|@DATA_DIR@|$DATA_DIR|g" \
  -e "s|@PORT@|$PORT|g" -e "s|@NODE@|$(command -v node)|g" \
  "$APP_DIR/deploy/toot-raft.service" > /etc/systemd/system/toot-raft.service
systemctl daemon-reload
systemctl enable --now toot-raft
systemctl restart toot-raft
sleep 2

if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null; then
  IP="$(curl -fsS -m 2 http://checkip.amazonaws.com 2>/dev/null || echo '<your-ec2-public-ip>')"
  echo
  URL="http://$IP"
  [[ "$PORT" != 80 ]] && URL="$URL:$PORT"
  echo "Bottoms Up! is running: $URL"
  echo "Logs:    sudo journalctl -u toot-raft -f"
  echo "Update:  bash deploy/update.sh"
else
  echo "The service did not come up. Check: sudo journalctl -u toot-raft -n 50" >&2
  exit 1
fi
