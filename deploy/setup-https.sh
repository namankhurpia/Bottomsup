#!/usr/bin/env bash
# Puts the game on https://<domain>, with free certificates that renew themselves. Caddy takes
# over ports 80 and 443 and passes everything (WebSockets too) to the game on port 8080. The www
# name and the old bare-IP address redirect to the domain, so old links keep working.
# Scores in /var/lib/toot-raft are untouched. Safe to run again.
# Usage, on the Ubuntu server, after pointing the domain's DNS at it:
#   sudo bash deploy/setup-https.sh                      (bottomsup.tech)
#   sudo DOMAIN=example.com bash deploy/setup-https.sh
set -euo pipefail
DOMAIN="${DOMAIN:-bottomsup.tech}"
GAME_PORT="${GAME_PORT:-8080}"
UNIT=/etc/systemd/system/toot-raft.service

[[ $EUID -eq 0 ]] || { echo "Run with sudo." >&2; exit 1; }
[[ -f "$UNIT" ]] || { echo "No toot-raft service here; run deploy/setup-ec2.sh first." >&2; exit 1; }

echo "== Installing Caddy (official package)"
if ! command -v caddy >/dev/null; then
  apt-get update -y
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sSfL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sSfL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "== Opening ports 80 and 443 in this machine's firewall"
# Oracle's Ubuntu images end the INPUT chain with a REJECT, so the rules must go in front of it
for port in 80 443; do
  iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
done
if command -v netfilter-persistent >/dev/null; then netfilter-persistent save; fi

echo "== Moving the game to port $GAME_PORT"
sed -i "s/^Environment=PORT=.*/Environment=PORT=$GAME_PORT/" "$UNIT"
systemctl daemon-reload

# the address this machine answers on from the outside, for the old links
PUBLIC_IP="$(curl -fsS -m 5 https://api.ipify.org || true)"

{
  cat <<EOF
$DOMAIN {
	reverse_proxy localhost:$GAME_PORT
}

www.$DOMAIN {
	redir https://$DOMAIN{uri} permanent
}
EOF
  if [[ -n "$PUBLIC_IP" ]]; then
    cat <<EOF

http://$PUBLIC_IP {
	redir https://$DOMAIN{uri} permanent
}
EOF
  fi
} > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

echo "== Restarting"
systemctl stop caddy || true
systemctl restart toot-raft # frees port 80 for Caddy
systemctl enable caddy
systemctl start caddy
sleep 3

curl -fsS "http://127.0.0.1:$GAME_PORT/api/health" >/dev/null && echo "Game is healthy on port $GAME_PORT."
if curl -fsS -m 30 "https://$DOMAIN/api/health" >/dev/null; then
  echo "All done: https://$DOMAIN"
else
  cat <<EOF

The game is running, but https://$DOMAIN doesn't answer yet. The usual reason on Oracle Cloud is
the network's own firewall: in the console, open your instance's subnet > Security List > Add
Ingress Rule, source 0.0.0.0/0, TCP, destination port 443. It starts working on its own a few
seconds later. To see what Caddy is doing: sudo journalctl -u caddy -f
EOF
fi
