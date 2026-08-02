import type { Vehicle } from "../types";
import { SPEED_LIMIT_KMH, SPEED_WARNING_KMH } from "../types";

export function isMoving(v: Vehicle) {
  return !v.offline && (v.speed || 0) > 5;
}

export function isOverspeed(v: Vehicle) {
  return (v.speed || 0) > SPEED_LIMIT_KMH;
}

/** green = ok, yellow = warning, red = overspeed */
export function speedBand(speed: number): "ok" | "warn" | "over" {
  const s = Number(speed) || 0;
  if (s > SPEED_LIMIT_KMH) return "over";
  if (s >= SPEED_WARNING_KMH) return "warn";
  return "ok";
}

export function freshnessMs(v: Vehicle) {
  if (!v.gpsTime) return Number.POSITIVE_INFINITY;
  return Date.now() - new Date(v.gpsTime).getTime();
}

export function isStale(v: Vehicle, maxMs = 15 * 60 * 1000) {
  return freshnessMs(v) > maxMs;
}

export function formatSpeed(speed: number) {
  return `${speed.toFixed(0)} km/h`;
}

export function formatRelative(iso: string | null | undefined) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return new Date(iso).toLocaleString();
}

export function statusTone(v: Vehicle): "offline" | "stale" | "overspeed" | "moving" | "idle" {
  if (v.offline || v.latitude == null || v.longitude == null) return "offline";
  if (isStale(v)) return "stale";
  if (isOverspeed(v)) return "overspeed";
  if (isMoving(v)) return "moving";
  return "idle";
}
