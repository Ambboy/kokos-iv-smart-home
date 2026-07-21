import { CubeFocus, House, SlidersHorizontal } from "@phosphor-icons/react";

export const DEFAULT_MODES = [
  { id: "overview", label: "Обзор", Icon: CubeFocus },
  { id: "rooms", label: "Комнаты", Icon: House },
  { id: "devices", label: "Устройства", Icon: SlidersHorizontal },
];

/**
 * @typedef {Object} ViewMode
 * @property {string} id
 * @property {string} label
 * @property {import("react").ComponentType<{size?: number, weight?: string, "aria-hidden"?: boolean}>} [Icon]
 * @property {boolean} [disabled]
 */

/**
 * @typedef {Object} ModeSwitchProps
 * @property {ViewMode[]} [modes]
 * @property {string} value
 * @property {(modeId: string) => void} onChange
 * @property {boolean} [disabled]
 * @property {string} [ariaLabel]
 */

/** @param {ModeSwitchProps} props */
export function ModeSwitch({
  modes = DEFAULT_MODES,
  value,
  onChange,
  disabled = false,
  ariaLabel = "Режим представления",
}) {
  return (
    <nav className="ui-mode-switch" aria-label={ariaLabel}>
      {modes.map((mode) => {
        const ModeIcon = mode.Icon;
        const selected = mode.id === value;

        return (
          <button
            key={mode.id}
            type="button"
            className="ui-mode-button"
            aria-pressed={selected}
            disabled={disabled || mode.disabled}
            onClick={() => onChange?.(mode.id)}
          >
            {ModeIcon ? (
              <ModeIcon aria-hidden="true" size={18} weight={selected ? "fill" : "regular"} />
            ) : null}
            <span>{mode.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
