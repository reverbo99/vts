import { useEffect, useState } from "react";
import { fetchHistory, toApiWallClock } from "../lib/api";
import { snapTrackToRoads, type TrackPoint } from "../lib/mapMatch";

export type { TrackPoint };

const TRACK_HOURS = 6;

export function useBusTrack(plate: string | null) {
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [snapped, setSnapped] = useState(false);

  useEffect(() => {
    if (!plate) {
      setPoints([]);
      setError(null);
      setCount(0);
      setSnapped(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      setPoints([]);
      setCount(0);
      setSnapped(false);

      const end = new Date();
      const start = new Date(end.getTime() - TRACK_HOURS * 60 * 60 * 1000);

      try {
        const data = await fetchHistory(
          plate!,
          toApiWallClock(start),
          toApiWallClock(end),
          controller.signal
        );
        if (cancelled) return;

        const raw: TrackPoint[] = [];
        for (const row of data.rows) {
          if (row.latitude == null || row.longitude == null) continue;
          raw.push([row.latitude, row.longitude]);
        }

        setCount(raw.length);

        if (raw.length < 2) {
          setPoints(raw);
          if (data.latraError && raw.length === 0) {
            setError(data.latraError);
          }
          return;
        }

        // Show raw trail immediately, then replace with road-snapped path
        setPoints(raw);

        const { points: road, snapped: ok } = await snapTrackToRoads(
          raw,
          controller.signal
        );
        if (cancelled) return;
        setPoints(road);
        setSnapped(ok);
      } catch (err) {
        if (cancelled || (err as Error).name === "AbortError") return;
        setError((err as Error).message || "Failed to load track");
        setPoints([]);
        setCount(0);
        setSnapped(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [plate]);

  return { points, loading, error, count, hours: TRACK_HOURS, snapped };
}
