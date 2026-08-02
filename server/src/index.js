import "dotenv/config";
import fs from "fs";
import http from "http";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import { fetchDtrHistory, fetchFleetSnapshot, formatLatraDateTime } from "./latra.js";
import {
  addBus,
  initDb,
  listActivePlates,
  listBuses,
  queryHistory,
  removeBus,
  savePositions,
  seedBusesFromFile,
} from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 8000);
const fleetPath = path.join(__dirname, "..", "fleet.txt");
const clientDist =
  process.env.CLIENT_DIST || path.join(__dirname, "..", "..", "client", "dist");

const app = express();
app.use(cors());
app.use(express.json());

/** @type {object[]} */
let latestVehicles = [];
let lastPollAt = null;
let polling = false;

async function getPlates() {
  return listActivePlates();
}

function toCsv(rows) {
  const headers = [
    "plate",
    "gps_time",
    "speed",
    "bearing",
    "latitude",
    "longitude",
    "altitude",
    "location",
    "owner",
    "event",
    "status",
    "source",
  ];
  const escape = (v) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

function parseWallClock(value) {
  const raw = String(value || "").trim();
  const m = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/
  );
  if (m) {
    const [, y, mo, d, h, mi, s = "00"] = m;
    return {
      wall: `${y}-${mo}-${d} ${h}:${mi}:${s}`,
      date: new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)),
    };
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid from/to datetime");
  return { wall: formatLatraDateTime(date), date };
}

function parseRange(query) {
  const start = query.from || query.start;
  const end = query.to || query.end;
  if (!start || !end) throw new Error("from and to are required");
  const startParsed = parseWallClock(start);
  const endParsed = parseWallClock(end);
  if (endParsed.date <= startParsed.date) throw new Error("to must be after from");
  return {
    startWall: startParsed.wall,
    endWall: endParsed.wall,
  };
}

app.get("/api/health", async (_req, res) => {
  try {
    const plates = await getPlates();
    res.json({
      ok: true,
      db: "mysql",
      plates: plates.length,
      pollMs: POLL_INTERVAL_MS,
      lastPollAt,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/fleet", async (_req, res) => {
  try {
    const [plates, buses] = await Promise.all([getPlates(), listBuses()]);
    res.json({
      plates,
      buses,
      vehicles: latestVehicles,
      at: lastPollAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/buses", async (_req, res) => {
  try {
    res.json({ buses: await listBuses() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/buses", async (req, res) => {
  try {
    const bus = await addBus(req.body?.plate, req.body?.label);
    res.status(201).json({ bus });
    pollOnce();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/buses/:plate", async (req, res) => {
  try {
    const bus = await removeBus(req.params.plate);
    if (!bus) return res.status(404).json({ error: "Bus not found" });
    latestVehicles = latestVehicles.filter(
      (v) => v.plate !== String(req.params.plate).toUpperCase()
    );
    broadcast(snapshotMessage());
    res.json({ bus });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/history/:plate", async (req, res) => {
  try {
    const plate = String(req.params.plate).trim().toUpperCase();
    const { startWall, endWall } = parseRange(req.query);
    const refresh = String(req.query.refresh || "1") !== "0";

    let latraCount = 0;
    let latraError = null;

    if (refresh) {
      try {
        const remote = await fetchDtrHistory(plate, startWall, endWall);
        latraCount = await savePositions(remote, "latra");
      } catch (err) {
        latraError = err.message;
      }
    }

    const rows = await queryHistory(plate, startWall, endWall);

    res.json({
      plate,
      from: startWall,
      to: endWall,
      count: rows.length,
      latraImported: latraCount,
      latraError,
      rows,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/history/:plate/csv", async (req, res) => {
  try {
    const plate = String(req.params.plate).trim().toUpperCase();
    const { startWall, endWall } = parseRange(req.query);
    const refresh = String(req.query.refresh || "1") !== "0";

    if (refresh) {
      try {
        const remote = await fetchDtrHistory(plate, startWall, endWall);
        await savePositions(remote, "latra");
      } catch {
        /* still export local rows */
      }
    }

    const rows = await queryHistory(plate, startWall, endWall);
    const csv = toCsv(rows);
    const fname = `${plate}_${startWall.replace(/[: ]/g, "-")}_${endWall.replace(/[: ]/g, "-")}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.send(csv);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false }));
  app.get(/^(?!\/api(?:\/|$)|\/ws(?:\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
  console.log(`[static] serving client from ${clientDist}`);
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function broadcast(payload) {
  const raw = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(raw);
  }
}

function snapshotMessage() {
  return {
    type: "snapshot",
    at: lastPollAt,
    pollMs: POLL_INTERVAL_MS,
    vehicles: latestVehicles,
  };
}

wss.on("connection", (socket) => {
  socket.send(JSON.stringify(snapshotMessage()));
});

async function pollOnce() {
  if (polling) return;
  polling = true;
  try {
    const plates = await getPlates();
    const vehicles = await fetchFleetSnapshot(plates);
    const saved = await savePositions(vehicles, "poll");
    latestVehicles = vehicles;
    lastPollAt = new Date().toISOString();
    broadcast(snapshotMessage());
    const moving = vehicles.filter((v) => v.speed > 5).length;
    console.log(
      `[poll] ${vehicles.length}/${plates.length} online · ${moving} moving · saved ${saved} · ${lastPollAt}`
    );
  } catch (err) {
    console.error("[poll] failed", err.message);
    broadcast({ type: "error", message: err.message, at: new Date().toISOString() });
  } finally {
    polling = false;
  }
}

async function start() {
  await initDb();
  await seedBusesFromFile(fleetPath);

  server.listen(PORT, async () => {
    const plates = await getPlates();
    console.log(`VTS fleet bridge http://localhost:${PORT}`);
    console.log(`WebSocket ws://localhost:${PORT}/ws`);
    console.log(`MySQL ready · tracking ${plates.length} buses every ${POLL_INTERVAL_MS}ms`);
    pollOnce();
    setInterval(pollOnce, POLL_INTERVAL_MS);
  });
}

start().catch((err) => {
  console.error("[fatal] failed to start", err);
  process.exit(1);
});
