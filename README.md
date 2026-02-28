# rsm-agent

> Lightweight host agent for [Remote Server Manager](https://github.com/your-org/remoteservermanager).  
> Polls for commands, executes them, and pushes system metrics back to the RSM control plane.

---

## Install

### Option A — npm (recommended, no clone needed)

```bash
npm install -g rsm-agent
```

### Option B — Docker

```bash
docker run -d \
  --name rsm-agent \
  --restart unless-stopped \
  --network host \
  --env-file /etc/rsm-agent/.env \
  ghcr.io/your-org/rsm-agent:latest
```

### Option C — Clone & build

```bash
git clone https://github.com/your-org/rsm-agent.git /opt/rsm-agent
cd /opt/rsm-agent
npm install
npm run build        # compiles TypeScript → dist/
```

---

## Requirements

| Requirement | Notes |
|---|---|
| Node.js ≥ 20 | 22 LTS recommended |
| Outbound HTTPS to RSM app URL | No inbound ports required |
| `sudo` or root (optional) | Only needed for Nginx / UFW / Fail2ban features |

---

## Configuration

Copy `.env.example` to `.env` and fill in the values:

```bash
cp $(npm root -g)/rsm-agent/.env.example /etc/rsm-agent/.env
nano /etc/rsm-agent/.env
```

| Variable | Required | Description |
|---|---|---|
| `APP_URL` | ✅ | Full HTTPS URL of your RSM app (no trailing slash) |
| `AGENT_ID` | ✅ | Host ID from the RSM dashboard |
| `AGENT_API_KEY` | ✅ | API key generated in the dashboard (shown once) |
| `AGENT_PORT` | — | Local HTTP port for `/health` & `/status` (default `4800`) |
| `POLL_INTERVAL_MS` | — | Command poll frequency in ms (default `5000`) |
| `METRICS_INTERVAL_MS` | — | Metrics push frequency in ms (default `30000`) |
| `COMMAND_TIMEOUT_MS` | — | Max command execution time in ms (default `300000`) |

---

## Running

```bash
# With npm global install
rsm-agent

# With .env in a custom location
NODE_ENV=production dotenv -e /etc/rsm-agent/.env rsm-agent

# Direct node (any install method)
node /opt/rsm-agent/dist/index.js
```

---

## Install as a systemd service (Linux)

```bash
sudo mkdir -p /etc/rsm-agent
sudo cp .env.example /etc/rsm-agent/.env
sudo nano /etc/rsm-agent/.env          # fill in values
```

Create `/etc/systemd/system/rsm-agent.service`:

```ini
[Unit]
Description=RSM Server Agent
After=network.target

[Service]
Type=simple
User=root
EnvironmentFile=/etc/rsm-agent/.env
ExecStart=/usr/bin/rsm-agent
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now rsm-agent
sudo journalctl -u rsm-agent -f        # live logs
```

---

## Local endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Liveness probe — returns `{"status":"ok"}` |
| `GET /status` | Full runtime state — agent ID, version, poll stats |

---

## Publishing a new version

Tag the commit and push — the GitHub Actions workflow handles the rest:

```bash
git tag agent-v0.2.0
git push --tags
```

The workflow (`.github/workflows/publish-agent.yml`) builds, bumps the version from the tag, and publishes to npm automatically.

---

## License

MIT


## What it does

- Registers to Next.js API using `AGENT_ID` + `AGENT_API_KEY`
- Polls for queued commands from the Next.js command API
- Streams command output and completion status through agent update API calls
- Exposes local health/status endpoints

## Requirements

- Node.js 22+
- Next.js app URL reachable from host machine

## Setup

1. Clone this repository (or only this folder in your deployment pipeline).
2. Copy `.env.example` to `.env` and set values.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run in development:
   ```bash
   npm run dev
   ```
5. Build and run production:
   ```bash
   npm run build
   npm start
   ```

## Environment

- `APP_URL`: Next.js base URL, e.g. `https://app.yourdomain.com`
- `AGENT_ID`: Agent id from host creation in frontend
- `AGENT_API_KEY`: One-time key generated from frontend
- `AGENT_PORT`: Local agent HTTP port
- `POLL_INTERVAL_MS`: Poll interval for next command fetch
- `COMMAND_TIMEOUT_MS`: Max command execution time

## Endpoints (local)

- `GET /health`
- `GET /status`

## Install as service (recommended)

### Linux (systemd)

Create `/etc/systemd/system/rsm-agent.service`:

```ini
[Unit]
Description=RSM Server Agent
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/rsm/server-agent
ExecStart=/usr/bin/node /opt/rsm/server-agent/dist/index.js
Restart=always
EnvironmentFile=/opt/rsm/server-agent/.env

[Install]
WantedBy=multi-user.target
```

Then run:

```bash
sudo systemctl daemon-reload
sudo systemctl enable rsm-agent
sudo systemctl start rsm-agent
```

### Windows (Task Scheduler or NSSM)

Use NSSM or Task Scheduler to run:

```powershell
node D:\rsm\server-agent\dist\index.js
```

Set it to start automatically and restart on failure.
