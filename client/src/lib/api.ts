const API_BASE = import.meta.env.VITE_API_URL || "";

async function parseJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function addBus(plate: string, label?: string) {
  const res = await fetch(`${API_BASE}/api/buses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plate, label }),
  });
  return parseJson(res);
}

export async function removeBus(plate: string) {
  const res = await fetch(`${API_BASE}/api/buses/${encodeURIComponent(plate)}`, {
    method: "DELETE",
  });
  return parseJson(res);
}

export type HistoryRow = {
  plate: string;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  speed: number;
  bearing: number;
  location: string | null;
  owner: string | null;
  event: string | null;
  status: string | null;
  gps_time: string | null;
  message_time: string | null;
  source: string;
};

export type HistoryResponse = {
  plate: string;
  from: string;
  to: string;
  count: number;
  latraImported: number;
  latraError: string | null;
  rows: HistoryRow[];
};

export function toApiWallClock(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export async function fetchHistory(
  plate: string,
  from: string,
  to: string,
  signal?: AbortSignal
) {
  const qs = new URLSearchParams({ from, to, refresh: "1" });
  const res = await fetch(
    `${API_BASE}/api/history/${encodeURIComponent(plate)}?${qs}`,
    { signal }
  );
  return parseJson(res) as Promise<HistoryResponse>;
}

export function historyCsvUrl(plate: string, from: string, to: string) {
  const qs = new URLSearchParams({ from, to, refresh: "1" });
  return `${API_BASE}/api/history/${encodeURIComponent(plate)}/csv?${qs}`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Split helpers for 24-hour history pickers */
export function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function toTime24Value(date: Date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

/** Combine date (yyyy-MM-dd) + 24h time (HH:mm[:ss]) → API wall clock */
export function combineDateTime24(date: string, time: string) {
  if (!date || !time) throw new Error("Invalid date/time");
  const t = time.length === 5 ? `${time}:00` : time;
  if (!/^\d{2}:\d{2}:\d{2}$/.test(t)) {
    throw new Error("Time must be 24-hour HH:mm:ss");
  }
  const [hh, mm, ss] = t.split(":").map(Number);
  if (hh > 23 || mm > 59 || ss > 59) throw new Error("Invalid 24-hour time");
  return `${date} ${t}`;
}

export function formatDateTime24(value: string | Date) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
