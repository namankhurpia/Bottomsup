# Deploying Toot Raft to EC2

One small server runs everything: the web page, the leaderboard API and the WebSocket rooms
(each room's physics runs on the server). Scores are a SQLite file in `/var/lib/toot-raft`.

## 1. The instance

- **Size:** `t3.small` or `t4g.small` (arm, cheaper) is plenty for a group of friends.
  Each active room steps one small physics world 60 times a second.
- **OS:** Amazon Linux 2023 or Ubuntu 22.04/24.04.
- **Security group, inbound rules:**
  - TCP **80** from `0.0.0.0/0` (the game)
  - TCP **22** from *your IP only* (SSH)
- An **Elastic IP** is worth attaching so the address doesn't change on reboot.

## 2. Get the code onto it

Either clone it from GitHub:

    git clone https://github.com/<you>/toot-raft.git ~/toot-raft

or copy it straight from your Mac (skip the heavy folders):

    rsync -av --exclude node_modules --exclude dist --exclude data \
      -e "ssh -i ~/.ssh/<your-key>.pem" ./ ec2-user@<ec2-ip>:~/toot-raft/

(`ec2-user` on Amazon Linux, `ubuntu` on Ubuntu.)

## 3. Install and start

    ssh -i ~/.ssh/<your-key>.pem ec2-user@<ec2-ip>
    cd ~/toot-raft
    sudo bash deploy/setup-ec2.sh

It installs Node 24 (official build, checksum-verified), runs `npm ci` + `npm run build`,
and installs a systemd service that serves the game on port 80, restarts on crashes and
starts on boot. At the end it prints the URL. Send that to your friends.

## Everyday commands (on the server)

| What | Command |
|---|---|
| Deploy new code | `cd ~/toot-raft && bash deploy/update.sh` (after `git push`, or re-run the rsync first) |
| Live logs | `sudo journalctl -u toot-raft -f` |
| Restart | `sudo systemctl restart toot-raft` |
| Health check | `curl localhost/api/health` |
| Back up scores | `sqlite3 /var/lib/toot-raft/scores.db ".backup scores-backup.db"` (or just copy the file while stopped) |
| All games ever | `sqlite3 /var/lib/toot-raft/scores.db "select * from games order by finished_at desc"` |

## Settings (environment variables in the service)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `80` (set by setup) | HTTP + WebSocket port |
| `DATA_DIR` | `/var/lib/toot-raft` | where `scores.db` lives |
| `STATIC_DIR` | `<app>/dist` | the built client |

To use another port, run setup as `sudo PORT=8080 bash deploy/setup-ec2.sh` and open that
port in the security group instead.

## HTTPS (optional, later)

Plain `http://` works fine for the game (sound and WebSockets don't need HTTPS). If you
get a domain name, put [Caddy](https://caddyserver.com) in front for automatic HTTPS:
run the game on port 8080 and give Caddy a two-line Caddyfile
(`yourdomain.com` / `reverse_proxy localhost:8080`). The client already switches to
`wss://` when the page is served over HTTPS.
