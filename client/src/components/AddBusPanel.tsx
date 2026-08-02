import { useState } from "react";
import { addBus } from "../lib/api";

type Props = {
  onAdded?: (plate: string) => void;
};

export function AddBusPanel({ onAdded }: Props) {
  const [plate, setPlate] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const data = await addBus(plate, label || undefined);
      setMessage(`${data.bus.plate} added to fleet`);
      setPlate("");
      setLabel("");
      onAdded?.(data.bus.plate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add bus");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="add-bus">
      <div className="add-bus-title">Add bus</div>
      <form onSubmit={onSubmit} className="add-bus-form">
        <input
          className="search"
          value={plate}
          onChange={(e) => setPlate(e.target.value.toUpperCase())}
          placeholder="Plate e.g. T123ABC"
          required
          minLength={5}
          maxLength={12}
          aria-label="Bus plate"
        />
        <input
          className="search"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional)"
          aria-label="Bus label"
        />
        <button type="submit" className="btn primary wide" disabled={busy || plate.length < 5}>
          {busy ? "Adding…" : "Add to system"}
        </button>
      </form>
      {message && <p className="form-ok">{message}</p>}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
