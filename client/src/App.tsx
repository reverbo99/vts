import { useMemo, useState } from "react";
import { FleetMap } from "./components/FleetMap";
import { FleetSidebar, SelectedDetail } from "./components/FleetSidebar";
import { HistoryModal } from "./components/HistoryModal";
import { useFleetSocket } from "./hooks/useFleetSocket";
import { formatRelative, isMoving, isOverspeed, isStale } from "./lib/fleet";
import "./App.css";

export default function App() {
  const { vehicles, updatedAt, pollMs, status, error } = useFleetSocket();
  const [selectedPlate, setSelectedPlate] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "moving" | "overspeed" | "idle">(
    "all"
  );
  const [historyPlate, setHistoryPlate] = useState<string | null>(null);

  const selected = useMemo(
    () => vehicles.find((v) => v.plate === selectedPlate) || null,
    [vehicles, selectedPlate]
  );

  const stats = useMemo(() => {
    const online = vehicles.filter((v) => !v.offline && v.latitude != null);
    return {
      total: vehicles.length,
      online: online.length,
      moving: online.filter(isMoving).length,
      overspeed: online.filter(isOverspeed).length,
      stale: online.filter((v) => isStale(v)).length,
    };
  }, [vehicles]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/bus.svg" alt="" width={36} height={36} />
          <div>
            <h1>Tilisho Fleet Live</h1>
            <p>LATRA VTS · OpenStreetMap · live WebSocket</p>
          </div>
        </div>

        <div className="stats">
          <div className="stat">
            <span>Fleet</span>
            <strong>{stats.total}</strong>
          </div>
          <div className="stat">
            <span>Online</span>
            <strong>{stats.online}</strong>
          </div>
          <div className="stat">
            <span>Moving</span>
            <strong>{stats.moving}</strong>
          </div>
          <div className="stat warn">
            <span>Over 80</span>
            <strong>{stats.overspeed}</strong>
          </div>
        </div>

        <div className="live-pill" data-status={status}>
          <span className="live-dot" />
          <div>
            <strong>{status === "live" ? "LIVE" : status.toUpperCase()}</strong>
            <small>
              {updatedAt
                ? `Updated ${formatRelative(updatedAt)} · every ${Math.round(pollMs / 1000)}s`
                : "Waiting for first snapshot…"}
            </small>
          </div>
        </div>
      </header>

      {error && <div className="banner">{error}</div>}

      <main className="workspace">
        <FleetSidebar
          vehicles={vehicles}
          selectedPlate={selectedPlate}
          query={query}
          onQuery={setQuery}
          onSelect={setSelectedPlate}
          filter={filter}
          onFilter={setFilter}
          onBusAdded={(plate) => setSelectedPlate(plate)}
        />

        <section className="map-pane">
          <FleetMap
            vehicles={vehicles}
            selectedPlate={selectedPlate}
            onSelect={setSelectedPlate}
          />
          {selected && (
            <div className="detail-dock">
              <SelectedDetail
                vehicle={selected}
                onHistory={(plate) => setHistoryPlate(plate)}
                onClose={() => setSelectedPlate(null)}
              />
            </div>
          )}
        </section>
      </main>

      {historyPlate && (
        <HistoryModal
          plate={historyPlate}
          open={Boolean(historyPlate)}
          onClose={() => setHistoryPlate(null)}
        />
      )}
    </div>
  );
}
