import { useEffect, useRef, useState } from "react";
import type { Vehicle, WsMessage } from "../types";

const WS_URL =
  import.meta.env.VITE_WS_URL ||
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;

export type ConnectionState = "connecting" | "live" | "reconnecting" | "error";

export function useFleetSocket() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [pollMs, setPollMs] = useState(8000);
  const [status, setStatus] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const retryRef = useRef(0);

  useEffect(() => {
    let closed = false;
    let socket: WebSocket | null = null;
    let timer: number | undefined;

    const connect = () => {
      if (closed) return;
      setStatus(retryRef.current === 0 ? "connecting" : "reconnecting");
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        retryRef.current = 0;
        setStatus("live");
        setError(null);
      };

      socket.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as WsMessage;
          if (msg.type === "snapshot") {
            setVehicles(msg.vehicles);
            setUpdatedAt(msg.at);
            setPollMs(msg.pollMs);
          } else if (msg.type === "error") {
            setError(msg.message);
          }
        } catch {
          /* ignore malformed */
        }
      };

      socket.onclose = () => {
        if (closed) return;
        setStatus("reconnecting");
        const delay = Math.min(15000, 1000 * 2 ** retryRef.current);
        retryRef.current += 1;
        timer = window.setTimeout(connect, delay);
      };

      socket.onerror = () => {
        setStatus("error");
        setError("WebSocket connection failed");
      };
    };

    connect();

    return () => {
      closed = true;
      if (timer) window.clearTimeout(timer);
      socket?.close();
    };
  }, []);

  return { vehicles, updatedAt, pollMs, status, error };
}
