const BASE = (process.env.LATRA_BASE_URL || "https://pis.latra.go.tz").replace(/\/$/, "");
const USER = process.env.LATRA_USER || "bsmart";
const PASS = process.env.LATRA_PASS || "bsmart$2021";

function authHeader() {
  return "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");
}

/**
 * @param {string} plate
 */
export async function fetchLastKnown(plate) {
  const url = `${BASE}/vts/latra/api/dtr_last_known?vehicle_reg_no=${encodeURIComponent(plate)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: authHeader(),
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${plate}: LATRA ${res.status} ${text.slice(0, 120)}`);
  }

  const body = await res.json();
  const row = Array.isArray(body) ? body[0] : null;
  if (!row) return null;

  return {
    plate: row.vehicle_reg_no || plate,
    owner: row.owner_name || null,
    status: row.installation_status || null,
    event: row.event_name || null,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    altitude: row.altitude ?? null,
    speed: Number(row.speed) || 0,
    bearing: Number(row.bearing) || 0,
    location: row.location_point_name || null,
    gpsTime: row.gps_time_stamp || null,
    messageTime: row.message_time_stamp || null,
    installer: row.installer_name || null,
    hdop: row.hdop ?? null,
    rssi: row.rssi ?? null,
    svCount: row.svCount ?? null,
  };
}

/**
 * Format a Date/ISO string as LATRA DTR expects: yyyy-MM-dd HH:mm:ss
 * @param {string|Date} value
 */
export function formatLatraDateTime(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(value.trim())) {
    const raw = value.trim().replace("T", " ");
    return raw.length === 16 ? `${raw}:00` : raw;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date/time");
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Pull historical track points from LATRA DTR.
 * @param {string} plate
 * @param {string|Date} start
 * @param {string|Date} end
 */
export async function fetchDtrHistory(plate, start, end) {
  const startStr = formatLatraDateTime(start);
  const endStr = formatLatraDateTime(end);
  const url =
    `${BASE}/vts/latra/api/dtr?vehicle_reg_no=${encodeURIComponent(plate)}` +
    `&start_date_time=${encodeURIComponent(startStr)}` +
    `&end_date_time=${encodeURIComponent(endStr)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: authHeader(),
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LATRA DTR ${res.status}: ${text.slice(0, 180)}`);
  }

  const body = await res.json();
  const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];

  return rows.map((row) => ({
    plate: row.vehicle_reg_no || plate,
    owner: row.owner_name || null,
    status: row.installation_status || null,
    event: row.event_name || null,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    altitude: row.altitude ?? null,
    speed: Number(row.speed) || 0,
    bearing: Number(row.bearing) || 0,
    location: row.location_point_name || null,
    gpsTime: row.gps_time_stamp || null,
    messageTime: row.message_time_stamp || null,
  }));
}

/**
 * Fetch all plates with limited concurrency.
 * @param {string[]} plates
 */
export async function fetchFleetSnapshot(plates, concurrency = 6) {
  const out = [];
  let i = 0;

  async function worker() {
    while (i < plates.length) {
      const plate = plates[i++];
      try {
        const vehicle = await fetchLastKnown(plate);
        if (vehicle && Number.isFinite(vehicle.latitude) && Number.isFinite(vehicle.longitude)) {
          out.push(vehicle);
        } else {
          out.push({
            plate,
            offline: true,
            latitude: null,
            longitude: null,
            speed: 0,
            bearing: 0,
            location: null,
            gpsTime: null,
            owner: null,
            event: null,
            status: null,
          });
        }
      } catch (err) {
        out.push({
          plate,
          offline: true,
          error: err.message,
          latitude: null,
          longitude: null,
          speed: 0,
          bearing: 0,
          location: null,
          gpsTime: null,
          owner: null,
          event: null,
          status: null,
        });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  out.sort((a, b) => a.plate.localeCompare(b.plate));
  return out;
}
