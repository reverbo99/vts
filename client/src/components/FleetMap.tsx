import { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import type { Vehicle } from "../types";
import type { TrackPoint } from "../hooks/useBusTrack";
import { createBusIcon } from "../lib/markers";
import { formatRelative, formatSpeed, statusTone } from "../lib/fleet";
import { SPEED_LIMIT_KMH } from "../types";

type Props = {
  vehicles: Vehicle[];
  selectedPlate: string | null;
  onSelect: (plate: string) => void;
  trackPoints?: TrackPoint[];
};

function FitFleet({
  vehicles,
  selectedPlate,
  trackPoints,
}: {
  vehicles: Vehicle[];
  selectedPlate: string | null;
  trackPoints: TrackPoint[];
}) {
  const map = useMap();

  useEffect(() => {
    const invalidate = () => map.invalidateSize();
    invalidate();
    const t = window.setTimeout(invalidate, 100);
    window.addEventListener("resize", invalidate);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", invalidate);
    };
  }, [map]);

  useEffect(() => {
    const selected = vehicles.find((v) => v.plate === selectedPlate);
    if (selected?.latitude != null && selected?.longitude != null) {
      map.flyTo([selected.latitude, selected.longitude], Math.max(map.getZoom(), 12), {
        duration: 0.8,
      });
      return;
    }

    const pts = vehicles.filter(
      (v) => v.latitude != null && v.longitude != null
    ) as Array<Vehicle & { latitude: number; longitude: number }>;

    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.setView([pts[0].latitude, pts[0].longitude], 11);
      return;
    }

    const bounds = pts.map((v) => [v.latitude, v.longitude] as [number, number]);
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 12 });
  }, [map, vehicles.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const selected = vehicles.find((v) => v.plate === selectedPlate);
    if (selected?.latitude != null && selected?.longitude != null) {
      map.flyTo([selected.latitude, selected.longitude], Math.max(map.getZoom(), 13), {
        duration: 0.7,
      });
    }
  }, [selectedPlate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (trackPoints.length < 2) return;
    map.fitBounds(trackPoints, { padding: [56, 56], maxZoom: 15, animate: true });
  }, [map, trackPoints]);

  return null;
}

export function FleetMap({
  vehicles,
  selectedPlate,
  onSelect,
  trackPoints = [],
}: Props) {
  const online = useMemo(
    () => vehicles.filter((v) => v.latitude != null && v.longitude != null),
    [vehicles]
  );

  const path = trackPoints as LatLngExpression[];

  return (
    <MapContainer
      center={[-6.16, 35.75]}
      zoom={6}
      className="fleet-map"
      zoomControl={false}
      attributionControl
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitFleet
        vehicles={online}
        selectedPlate={selectedPlate}
        trackPoints={trackPoints}
      />
      {path.length >= 2 && (
        <Polyline
          positions={path}
          pathOptions={{
            color: "#3D7EFF",
            weight: 4,
            opacity: 0.85,
            lineJoin: "round",
            lineCap: "round",
          }}
        />
      )}
      {online.map((v) => (
        <Marker
          key={v.plate}
          position={[v.latitude as number, v.longitude as number]}
          icon={createBusIcon(v, v.plate === selectedPlate)}
          eventHandlers={{ click: () => onSelect(v.plate) }}
        >
          <Popup>
            <div className="map-popup">
              <strong className="mono">{v.plate}</strong>
              <div className={`tone tone-${statusTone(v)}`}>
                {statusTone(v).toUpperCase()} · {formatSpeed(v.speed)}
              </div>
              <p>{v.location || "Unknown location"}</p>
              <p className="muted">GPS {formatRelative(v.gpsTime)}</p>
              <p className="muted">Limit {SPEED_LIMIT_KMH} km/h</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
