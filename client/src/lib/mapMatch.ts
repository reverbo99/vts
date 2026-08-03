export type TrackPoint = [number, number];

const OSRM_BASE =
  import.meta.env.VITE_OSRM_URL || "https://router.project-osrm.org";

/** Rough metres between two lat/lng points */
function distanceM(a: TrackPoint, b: TrackPoint) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Drop near-duplicate GPS samples */
function dedupeClose(points: TrackPoint[], minGapM = 20): TrackPoint[] {
  if (points.length === 0) return [];
  const out: TrackPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (distanceM(out[out.length - 1], points[i]) >= minGapM) {
      out.push(points[i]);
    }
  }
  // Always keep last point
  const last = points[points.length - 1];
  if (distanceM(out[out.length - 1], last) > 1) out.push(last);
  return out;
}

/** Evenly thin to at most `max` points, keeping ends */
function thinEvenly(points: TrackPoint[], max: number): TrackPoint[] {
  if (points.length <= max) return points;
  const out: TrackPoint[] = [];
  const last = points.length - 1;
  for (let i = 0; i < max; i++) {
    const idx = Math.round((i * last) / (max - 1));
    const p = points[idx];
    if (out.length === 0 || out[out.length - 1] !== p) out.push(p);
  }
  return out;
}

function toOsrmCoords(points: TrackPoint[]) {
  return points.map(([lat, lng]) => `${lng},${lat}`).join(";");
}

type GeoJsonLine = {
  type: string;
  coordinates: [number, number][];
};

function geometryToTrack(geometry: GeoJsonLine | undefined): TrackPoint[] {
  if (!geometry?.coordinates?.length) return [];
  return geometry.coordinates.map(([lng, lat]) => [lat, lng] as TrackPoint);
}

async function osrmMatch(
  points: TrackPoint[],
  signal?: AbortSignal
): Promise<TrackPoint[]> {
  const coords = toOsrmCoords(points);
  const radiuses = points.map(() => 50).join(";");
  const url =
    `${OSRM_BASE}/match/v1/driving/${coords}` +
    `?overview=full&geometries=geojson&tidy=true&gaps=ignore&radiuses=${radiuses}`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`OSRM match failed (${res.status})`);
  const data = await res.json();
  if (data.code !== "Ok") throw new Error(data.message || data.code || "match failed");

  // Prefer full matched geometry; else stitch matching geometries
  if (data.matchings?.length) {
    const merged: TrackPoint[] = [];
    for (const m of data.matchings) {
      const pts = geometryToTrack(m.geometry);
      for (const p of pts) {
        if (
          merged.length === 0 ||
          distanceM(merged[merged.length - 1], p) > 1
        ) {
          merged.push(p);
        }
      }
    }
    if (merged.length >= 2) return merged;
  }
  throw new Error("empty match geometry");
}

/** Route along roads through waypoint chunks (stronger road-follow) */
async function osrmRoute(
  points: TrackPoint[],
  signal?: AbortSignal
): Promise<TrackPoint[]> {
  const CHUNK = 80;
  const out: TrackPoint[] = [];

  for (let start = 0; start < points.length - 1; start += CHUNK - 1) {
    const chunk = points.slice(start, Math.min(start + CHUNK, points.length));
    if (chunk.length < 2) continue;

    const coords = toOsrmCoords(chunk);
    const url =
      `${OSRM_BASE}/route/v1/driving/${coords}` +
      `?overview=full&geometries=geojson&continue_straight=true`;

    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`OSRM route failed (${res.status})`);
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) {
      throw new Error(data.message || data.code || "route failed");
    }

    const pts = geometryToTrack(data.routes[0].geometry);
    for (const p of pts) {
      if (out.length === 0 || distanceM(out[out.length - 1], p) > 1) {
        out.push(p);
      }
    }
  }

  if (out.length < 2) throw new Error("empty route geometry");
  return out;
}

/**
 * Snap a raw GPS polyline onto the OpenStreetMap road network via OSRM.
 * Falls back to the original points if matching/routing fails.
 */
export async function snapTrackToRoads(
  points: TrackPoint[],
  signal?: AbortSignal
): Promise<{ points: TrackPoint[]; snapped: boolean }> {
  if (points.length < 2) return { points, snapped: false };

  const cleaned = thinEvenly(dedupeClose(points, 25), 100);

  try {
    const matched = await osrmMatch(cleaned, signal);
    return { points: matched, snapped: true };
  } catch {
    // Match can fail on large gaps — route through waypoints instead
  }

  try {
    const routed = await osrmRoute(cleaned, signal);
    return { points: routed, snapped: true };
  } catch {
    return { points, snapped: false };
  }
}
