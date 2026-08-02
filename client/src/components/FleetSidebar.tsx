import type { Vehicle } from "../types";
import {
  formatRelative,
  formatSpeed,
  isMoving,
  isOverspeed,
  statusTone,
} from "../lib/fleet";
import { AddBusPanel } from "./AddBusPanel";

type Props = {
  vehicles: Vehicle[];
  selectedPlate: string | null;
  query: string;
  onQuery: (q: string) => void;
  onSelect: (plate: string) => void;
  filter: "all" | "moving" | "overspeed" | "idle";
  onFilter: (f: Props["filter"]) => void;
  onBusAdded?: (plate: string) => void;
};

export function FleetSidebar({
  vehicles,
  selectedPlate,
  query,
  onQuery,
  onSelect,
  filter,
  onFilter,
  onBusAdded,
}: Props) {
  const filtered = vehicles.filter((v) => {
    if (query && !v.plate.toLowerCase().includes(query.toLowerCase())) return false;
    const tone = statusTone(v);
    if (filter === "moving") return tone === "moving";
    if (filter === "overspeed") return tone === "overspeed";
    if (filter === "idle") return tone === "idle" || tone === "stale";
    return true;
  });

  return (
    <aside className="sidebar">
      <div className="sidebar-tools">
        <input
          className="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search plate…"
          aria-label="Search plate"
        />
        <div className="filters" role="tablist" aria-label="Fleet filters">
          {(
            [
              ["all", "All"],
              ["moving", "Moving"],
              ["overspeed", "Over"],
              ["idle", "Idle"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              className={filter === id ? "chip active" : "chip"}
              onClick={() => onFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ul className="fleet-list">
        {filtered.map((v) => (
          <li key={v.plate}>
            <button
              type="button"
              className={
                selectedPlate === v.plate ? "fleet-row selected" : "fleet-row"
              }
              onClick={() => onSelect(v.plate)}
            >
              <span className={`dot tone-${statusTone(v)}`} aria-hidden />
              <span className="row-main">
                <span className="mono plate">{v.plate}</span>
                <span className="loc">{v.location || "No location"}</span>
              </span>
              <span className="row-meta">
                <span className={isOverspeed(v) ? "speed hot" : "speed"}>
                  {formatSpeed(v.speed)}
                </span>
                <span className="ago">{formatRelative(v.gpsTime)}</span>
              </span>
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="empty">No buses match this filter.</li>
        )}
      </ul>

      <AddBusPanel onAdded={onBusAdded} />

      <div className="legend">
        <span><i className="swatch moving" /> Moving</span>
        <span><i className="swatch idle" /> Idle</span>
        <span><i className="swatch overspeed" /> Over {">"}80</span>
        <span><i className="swatch stale" /> Stale</span>
      </div>
    </aside>
  );
}

type DetailProps = {
  vehicle: Vehicle | null;
  onHistory?: (plate: string) => void;
  onClose?: () => void;
};

export function SelectedDetail({ vehicle, onHistory, onClose }: DetailProps) {
  if (!vehicle) return null;

  const tone = statusTone(vehicle);

  return (
    <div className="detail">
      <button
        type="button"
        className="detail-close"
        onClick={onClose}
        aria-label="Close bus card"
        title="Close"
      >
        ✕
      </button>
      <div className="detail-head">
        <div>
          <div className="mono plate-lg">{vehicle.plate}</div>
          <div className="muted">{vehicle.owner || "Unknown operator"}</div>
        </div>
        <div className="detail-actions">
          <div className={`badge tone-${tone}`}>{tone}</div>
          <button
            type="button"
            className="btn primary"
            onClick={() => onHistory?.(vehicle.plate)}
          >
            History
          </button>
        </div>
      </div>

      <div className="detail-grid">
        <div>
          <span className="label">Speed</span>
          <strong className={isOverspeed(vehicle) ? "hot" : undefined}>
            {formatSpeed(vehicle.speed)}
          </strong>
        </div>
        <div>
          <span className="label">Bearing</span>
          <strong>{Math.round(vehicle.bearing)}°</strong>
        </div>
        <div>
          <span className="label">GPS age</span>
          <strong>{formatRelative(vehicle.gpsTime)}</strong>
        </div>
        <div>
          <span className="label">Motion</span>
          <strong>{isMoving(vehicle) ? "Under way" : "Stopped"}</strong>
        </div>
      </div>

      <p className="detail-loc">{vehicle.location || "—"}</p>
      <p className="muted tiny">
        {vehicle.latitude?.toFixed(5)}, {vehicle.longitude?.toFixed(5)}
        {vehicle.event ? ` · ${vehicle.event}` : ""}
      </p>
    </div>
  );
}
