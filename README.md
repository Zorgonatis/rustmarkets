Vending Machines
================

Minimal web app to browse every vending machine on a Rust server using `@liamcottle/rustplus.js`. Includes an interactive map with clustering, searchable inventory, and a clean popup that shows “For Sale | Cost | Stock”.

Setup
-----
- Requirements: Node.js 18+ (or 20/22 LTS).

Pairing Guide (where to put things)
-----------------------------------
You only need four values to run this app: `ip`, `port`, `playerId`, `playerToken`. These come from a Pairing Notification after you press "Pair" in-game.

1) On a desktop with Google Chrome installed:
- Register once with Rust+ Companion services:
  - `npx @liamcottle/rustplus.js fcm-register`
  - This prints a JSON with `fcm_credentials`, `expo_push_token`, `rustplus_auth_token` and writes a `rustplus.config.json`. This JSON is NOT used by this web app.
- Listen for pairing notifications:
  - `npx @liamcottle/rustplus.js fcm-listen`
  - In-game, click Pair on the target server. The console will print a JSON like:
    ```json
    {
      "img": "",
      "port": "28082",
      "ip": "203.0.113.42",
      "name": "your-server-name",
      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "type": "server",
      "url": "",
      "desc": "your-server-description",
      "playerId": "7656119XXXXXXXXXX",
      "playerToken": "-123456789"
    }
    ```

2) Put these values in `.env` (in this project):
- `RUST_ADDRESS=<ip>`
- `RUST_PORT=<port>` (this is `app.port`, not the game port)
- `RUST_PLAYER_ID=<playerId>` (Steam64)
- `RUST_PLAYER_TOKEN=<playerToken>` (can be negative)
- Optional: `RUST_USE_FACEPUNCH_PROXY=true` if direct websocket to the server is blocked by firewall/NAT.

Quick helper (optional)
-----------------------
If you saved the pairing notification JSON to a file (e.g. `pairing.json`), you can apply it to `.env` with:

```
npm run apply-pairing -- pairing.json
```

This only uses fields `ip`, `port`, `playerId`, `playerToken`. It does not use the `fcm-register` JSON.

Configuration
-------------
- Copy `.env.example` to `.env` and fill in:
  - `RUST_ADDRESS` – server IP or hostname
  - `RUST_PORT` – `app.port` from server config (often 28082)
  - `RUST_PLAYER_ID` – your Steam64 ID
  - `RUST_PLAYER_TOKEN` – player token from pairing
  - Optional: `RUST_USE_FACEPUNCH_PROXY=true` if direct websocket is not reachable (proxy has strict rate limits)
  - Optional timeouts/TTLs (ms): `RUST_TIMEOUT_MS`, `INFO_TTL_MS`, `VENDING_TTL_MS`, `MAP_TTL_MS`

Run
---
```
npm install
npm run start
```
- Open `http://localhost:3000` in your browser.

API
---
- `GET /api/health` – connectivity check
- `GET /api/info` – Rust server info (name, player counts, etc)
- `GET /api/vending-machines` – vending machines with sell orders
 - `GET /api/map` – map metadata (width/height/oceanMargin/monuments)
 - `GET /api/map.jpg` – map image (JPEG)

Notes
-----
 - The backend maintains a persistent Rust+ websocket and reconnects automatically on disconnect.
 - Rate limits: Very large maps may contain hundreds of vending machines; small TTLs help avoid hitting Rust+ token limits. Defaults: info=10s, vending=5s, map=5m.
 
Item Names
----------
- By default, vending orders return `itemId`/`currencyId`. To show names, add a file at `data/items.json` with a mapping of Rust item IDs to names:

```
{
  "-932201673": { "displayName": "Scrap", "shortName": "scrap" },
  "190184021": { "displayName": "Rowboat", "shortName": "rowboat" }
}
```

 - The server automatically loads this file on startup and enriches responses with `itemName` and `currencyName`.
 - `data/items.json` is tracked in git so teams can share the same item-name mapping. If you prefer a private mapping, place it elsewhere and ignore it.

UI Features
-----------
- Interactive map with pan/zoom, auto-fit on first load, and density clustering.
- Click clusters to zoom or pick a machine; click a marker for details.
- Clean popup table (For Sale | Cost | Stock) with no column overlap.
- Search box filters items across all vending machines; clicking a result zooms to the machine and opens its popup.

 - The `fcm-register` output (with FCM/Expo/Auth tokens) is only for the CLI tooling. This app does not use those tokens at runtime.

Deploying on a Server
---------------------
Below are two common paths: systemd or PM2, plus an optional reverse proxy.

1) Prepare the host
- Install Node.js 18+ (or LTS) on your server.
- Open the Rust server’s `app.port` to the app host, or set `RUST_USE_FACEPUNCH_PROXY=true` (not recommended for production due to 418/429 rate limits).

2) Install the app
- Clone or copy this repository to the server, e.g. `/opt/vending`.
- In that folder:
  - `cp .env.example .env` and fill in your pairing values
  - `npm install`
  - Test: `npm start` then open `http://SERVER:3000`

3A) Run with systemd (recommended)
Create `/etc/systemd/system/vending.service` (adjust paths/user):

```
[Unit]
Description=Rust Vending Machines
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/vending
ExecStart=/usr/bin/node server/index.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Then:
- `sudo systemctl daemon-reload`
- `sudo systemctl enable --now vending`
- `journalctl -u vending -f` to watch logs

3B) Run with PM2
```
npm install -g pm2
pm2 start server/index.js --name vending --update-env
pm2 save
pm2 startup  # follow instructions to enable on boot
```

4) Reverse proxy (optional, HTTPS)
Example nginx site (port 443 TLS termination, proxy to 3000):

```
server {
  listen 80;
  server_name vending.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name vending.example.com;
  ssl_certificate     /etc/letsencrypt/live/vending.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/vending.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
  }

  # cache the JPEG for a short time (optional)
  location /api/map.jpg { expires 2m; proxy_pass http://127.0.0.1:3000; }
}
```

Troubleshooting
---------------
- `ECONNREFUSED <ip:port>`: The host cannot reach the Rust server’s `app.port`. Check firewall/NAT or use proxy mode (not ideal).
- `Unexpected server response: 418/429` when proxying: Facepunch proxy is rate-limited. Prefer a direct websocket if possible.
- Timeouts on `/api/vending-machines`: busy server, large maps, or slow network. Increase `RUST_TIMEOUT_MS` or raise `VENDING_TTL_MS`.
- Item names missing/null: add them to `data/items.json` and restart.
