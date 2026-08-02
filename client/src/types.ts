export type Vehicle = {
  plate: string;
  owner?: string | null;
  status?: string | null;
  event?: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude?: number | null;
  speed: number;
  bearing: number;
  location?: string | null;
  gpsTime?: string | null;
  messageTime?: string | null;
  installer?: string | null;
  offline?: boolean;
  error?: string;
};

export type SnapshotMessage = {
  type: "snapshot";
  at: string | null;
  pollMs: number;
  vehicles: Vehicle[];
};

export type ErrorMessage = {
  type: "error";
  message: string;
  at: string;
};

export type WsMessage = SnapshotMessage | ErrorMessage;

export const SPEED_LIMIT_KMH = 80;
/** Warning band starts here (yellow), overspeed above SPEED_LIMIT_KMH (red) */
export const SPEED_WARNING_KMH = 70;
