import L from "leaflet";
import type { Vehicle } from "../types";
import { statusTone } from "../lib/fleet";

const COLORS = {
  moving: "#1FA97A",
  idle: "#3D7EFF",
  overspeed: "#E23B3B",
  stale: "#8B93A7",
  offline: "#5C6478",
} as const;

export function markerColor(v: Vehicle) {
  return COLORS[statusTone(v)];
}

export function createBusIcon(v: Vehicle, selected = false) {
  const color = markerColor(v);
  const size = selected ? 44 : 36;
  const rotation = v.bearing || 0;
  const pulse =
    statusTone(v) === "moving" || statusTone(v) === "overspeed"
      ? `<span class="bus-pulse" style="border-color:${color}"></span>`
      : "";

  return L.divIcon({
    className: "bus-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <div class="bus-marker-wrap ${selected ? "is-selected" : ""}" style="width:${size}px;height:${size}px">
        ${pulse}
        <div class="bus-marker-body" style="background:${color};transform:rotate(${rotation}deg)">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="#fff" d="M12 3c-3.5 0-6 1.2-6 3.2V15c0 1 .7 1.8 1.7 2.1L7 19.2c0 .4.3.8.8.8h.4c.4 0 .7-.3.8-.6l.7-1.4h4.6l.7 1.4c.1.3.4.6.8.6h.4c.4 0 .8-.3.8-.8l-.7-2.1c1-.3 1.7-1.1 1.7-2.1V6.2C18 4.2 15.5 3 12 3zm-3.2 11.2a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4zm6.4 0a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4zM8 9.5V7.2c0-.3.3-.6.6-.6h6.8c.3 0 .6.3.6.6v2.3c0 .3-.3.6-.6.6H8.6c-.3 0-.6-.3-.6-.6z"/>
          </svg>
        </div>
      </div>
    `,
  });
}
