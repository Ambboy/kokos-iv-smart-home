import { AirplaneTilt, Crosshair, Cube, MapTrifold } from "@phosphor-icons/react";

const PRESETS = [
  { id: "dollhouse", label: "Макет", Icon: Cube },
  { id: "top", label: "Сверху", Icon: MapTrifold },
  { id: "room", label: "Фокус", Icon: Crosshair },
];

/**
 * @typedef {Object} CameraToolbarProps
 * @property {"dollhouse"|"top"|"room"|"glazing"} value
 * @property {(preset: "dollhouse"|"top"|"room") => void} onChange
 * @property {() => void} onFlight
 * @property {boolean} [flightMode]
 */

/** @param {CameraToolbarProps} props */
export function CameraToolbar({ value, onChange, onFlight, flightMode = false }) {
  return (
    <nav className="ui-camera-toolbar" aria-label="Камера">
      {PRESETS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id && !flightMode}
          onClick={() => onChange?.(id)}
        >
          <Icon aria-hidden="true" size={18} weight={value === id ? "fill" : "regular"} />
          <span>{label}</span>
        </button>
      ))}
      <button type="button" aria-pressed={flightMode} onClick={onFlight}>
        <AirplaneTilt aria-hidden="true" size={18} weight={flightMode ? "fill" : "regular"} />
        <span>Полёт</span>
      </button>
    </nav>
  );
}
