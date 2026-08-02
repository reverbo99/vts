import { useEffect, useRef, useState } from "react";
import flatpickr from "flatpickr";
import type { Instance as FlatpickrInstance } from "flatpickr/dist/types/instance";
import "flatpickr/dist/flatpickr.min.css";
import {
  fetchHistory,
  formatDateTime24,
  historyCsvUrl,
  type HistoryRow,
} from "../lib/api";
import { speedBand } from "../lib/fleet";
import { SPEED_LIMIT_KMH, SPEED_WARNING_KMH } from "../types";

type Props = {
  plate: string;
  open: boolean;
  onClose: () => void;
};

function toApiValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function HistoryModal({ plate, open, onClose }: Props) {
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const fromPicker = useRef<FlatpickrInstance | null>(null);
  const toPicker = useRef<FlatpickrInstance | null>(null);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [meta, setMeta] = useState<{
    count: number;
    latraImported: number;
    latraError: string | null;
  } | null>(null);

  useEffect(() => {
    if (!open) return;

    const end = new Date();
    const start = new Date(end.getTime() - 60 * 60 * 1000);
    setFrom(toApiValue(start));
    setTo(toApiValue(end));
    setRows([]);
    setMeta(null);
    setError(null);

    // Wait a tick so inputs are mounted
    const timer = window.setTimeout(() => {
      fromPicker.current?.destroy();
      toPicker.current?.destroy();

      if (fromRef.current) {
        fromPicker.current = flatpickr(fromRef.current, {
          enableTime: true,
          enableSeconds: true,
          time_24hr: true,
          allowInput: false,
          clickOpens: true,
          dateFormat: "Y-m-d H:i:S",
          defaultDate: start,
          maxDate: end,
          onChange: (dates) => {
            if (dates[0]) setFrom(toApiValue(dates[0]));
          },
        });
      }

      if (toRef.current) {
        toPicker.current = flatpickr(toRef.current, {
          enableTime: true,
          enableSeconds: true,
          time_24hr: true,
          allowInput: false,
          clickOpens: true,
          dateFormat: "Y-m-d H:i:S",
          defaultDate: end,
          onChange: (dates) => {
            if (dates[0]) setTo(toApiValue(dates[0]));
          },
        });
      }
    }, 0);

    return () => {
      window.clearTimeout(timer);
      fromPicker.current?.destroy();
      toPicker.current?.destroy();
      fromPicker.current = null;
      toPicker.current = null;
    };
  }, [open, plate]);

  if (!open) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHistory(plate, from, to);
      setRows(data.rows);
      setMeta({
        count: data.count,
        latraImported: data.latraImported,
        latraError: data.latraError,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
      setRows([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    window.open(historyCsvUrl(plate, from, to), "_blank");
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 id="history-title">Bus history</h2>
            <p className="mono muted">{plate}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form className="history-form" onSubmit={onSubmit}>
          <label>
            <span>From</span>
            <input
              ref={fromRef}
              className="mono picker-input"
              type="text"
              readOnly
              placeholder="Select date & time"
              required
            />
          </label>
          <label>
            <span>To</span>
            <input
              ref={toRef}
              className="mono picker-input"
              type="text"
              readOnly
              placeholder="Select date & time"
              required
            />
          </label>
          <button type="submit" className="btn primary" disabled={loading || !from || !to}>
            {loading ? "Loading…" : "Get history"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!rows.length || loading}
            onClick={exportCsv}
          >
            Export CSV
          </button>
        </form>

        {error && <div className="form-error">{error}</div>}
        {meta && (
          <p className="muted tiny history-meta">
            {meta.count} points
            {meta.latraImported ? ` · imported ${meta.latraImported} from LATRA` : ""}
            {meta.latraError ? ` · LATRA note: ${meta.latraError}` : ""}
            {" · "}
            <span className="speed-legend">
              <i className="swatch speed-ok" /> {"<"}{SPEED_WARNING_KMH}
              <i className="swatch speed-warn" /> {SPEED_WARNING_KMH}–{SPEED_LIMIT_KMH}
              <i className="swatch speed-over" /> {">"}{SPEED_LIMIT_KMH} km/h
            </span>
          </p>
        )}

        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>GPS time</th>
                <th>Speed</th>
                <th>Location</th>
                <th>Lat</th>
                <th>Lng</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const band = speedBand(r.speed);
                return (
                  <tr key={`${r.gps_time}-${i}`} className={`speed-row-${band}`}>
                    <td className="mono">
                      {r.gps_time ? formatDateTime24(r.gps_time) : "—"}
                    </td>
                    <td>
                      <span className={`speed-pill speed-${band}`}>
                        {Number(r.speed || 0).toFixed(1)}
                      </span>
                    </td>
                    <td>{r.location || "—"}</td>
                    <td>{r.latitude?.toFixed(5) ?? "—"}</td>
                    <td>{r.longitude?.toFixed(5) ?? "—"}</td>
                    <td>{r.source}</td>
                  </tr>
                );
              })}
              {!rows.length && !loading && (
                <tr>
                  <td colSpan={6} className="empty">
                    Choose a range and click Get history.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
