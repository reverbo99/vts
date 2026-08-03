import { useEffect, useState } from "react";
import { fetchHistory, toApiWallClock } from "../lib/api";

export type TrackPoint = [number, number];

const TRACK_HOURS = 6;

export function useBusTrack(plate: string | null) {
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!plate) {
      setPoints([]);
      setError(null);
      setCount(0);
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

        const pts: TrackPoint[] = [];
        for (const row of data.rows) {
          if (row.latitude == null || row.longitude == null) continue;
          pts.push([row.latitude, row.longitude]);
        }

        setPoints(pts);
        setCount(data.count);
        if (data.latraError && pts.length === 0) {
          setError(data.latraError);
        }
      } catch (err) {
        if (cancelled || (err as Error).name === "AbortError") return;
        setError((err as Error).message || "Failed to load track");
        setPoints([]);
        setCount(0);
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

  return { points, loading, error, count, hours: TRACK_HOURS };
}
