# Tilisho Fleet Live (LATRA VTS)

Live OpenStreetMap dashboard for Tilisho buses. A Node bridge polls LATRA `dtr_last_known` and pushes snapshots over WebSocket.

## Quick start

```bash
npm install
npm run dev
```

One command starts the LATRA bridge **and** the dashboard.

Open http://localhost:5173 (or the port Vite prints).

Windows: double-click `start.bat`, or run `npm run dev` from the project root.

## Fleet plates

Edit `server/fleet.txt` (one plate per line).

## Config

`server/.env`:

| Variable | Default | Meaning |
|----------|---------|---------|
| `LATRA_USER` / `LATRA_PASS` | public PIS Basic auth | LATRA API credentials |
| `LATRA_BASE_URL` | `https://pis.latra.go.tz` | PIS host |
| `POLL_INTERVAL_MS` | `8000` | refresh interval |
| `PORT` | `8787` | HTTP + WS port |

Client optional: `VITE_WS_URL=ws://localhost:8787/ws`

## How live updates work

1. Server polls `/vts/latra/api/dtr_last_known` for each plate
2. Broadcasts a `snapshot` JSON message on `ws://localhost:8787/ws`
3. Map markers + sidebar update in place (speed, bearing, location, GPS age)

Marker colors: green moving · blue idle · red over 80 km/h · grey stale/offline

## Database (MySQL)

Configured in `server/.env`:

```
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=vts
```

On startup the server creates database `vts` (if missing) and tables `buses` / `positions`.

- Every live poll is stored in `positions`
- Fleet plates live in `buses` (seeded from `server/fleet.txt` on first run)
- **Add bus** panel writes into `buses`
- **History** pulls LATRA DTR for the selected range, saves points, then shows/export CSV
