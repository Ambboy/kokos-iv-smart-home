import { useEffect } from "react";
import {
  AirplaneTilt,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  X,
} from "@phosphor-icons/react";

/**
 * @typedef {Object} FlightHudProps
 * @property {boolean} active
 * @property {() => void} onExit
 * @property {(direction: "forward"|"backward"|"left"|"right"|"up"|"down", active: boolean) => void} [onMove]
 * @property {string} [instruction]
 */

/** @param {FlightHudProps} props */
export function FlightHud({
  active,
  onExit,
  onMove,
  instruction = "WASD или стрелки для движения, Q/E по высоте",
}) {
  useEffect(() => {
    if (!active) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onExit?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [active, onExit]);

  if (!active) return null;

  const bindHold = (direction) => ({
    onPointerDown: (event) => {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      onMove?.(direction, true);
    },
    onPointerUp: () => onMove?.(direction, false),
    onPointerCancel: () => onMove?.(direction, false),
    onLostPointerCapture: () => onMove?.(direction, false),
    onContextMenu: (event) => event.preventDefault(),
  });

  return (
    <section className="ui-flight-hud" aria-label="Свободный полёт">
      <div className="ui-flight-copy">
        <span className="ui-flight-icon" aria-hidden="true">
          <AirplaneTilt size={20} weight="fill" />
        </span>
        <span>
          <strong>Свободный полёт</strong>
          <span>{instruction}</span>
        </span>
      </div>

      <div className="ui-flight-pad" aria-label="Сенсорное управление движением">
        <button type="button" aria-label="Двигаться вперёд" {...bindHold("forward")}>
          <ArrowUp aria-hidden="true" size={18} />
        </button>
        <button type="button" aria-label="Двигаться влево" {...bindHold("left")}>
          <ArrowLeft aria-hidden="true" size={18} />
        </button>
        <button type="button" aria-label="Двигаться назад" {...bindHold("backward")}>
          <ArrowDown aria-hidden="true" size={18} />
        </button>
        <button type="button" aria-label="Двигаться вправо" {...bindHold("right")}>
          <ArrowRight aria-hidden="true" size={18} />
        </button>
        <button type="button" className="ui-flight-height" {...bindHold("up")}>
          <span aria-hidden="true">E</span>
          <span className="ui-visually-hidden">Подняться</span>
        </button>
        <button type="button" className="ui-flight-height" {...bindHold("down")}>
          <span aria-hidden="true">Q</span>
          <span className="ui-visually-hidden">Опуститься</span>
        </button>
      </div>

      <button type="button" className="ui-flight-exit" onClick={onExit}>
        <X aria-hidden="true" size={18} />
        <span>Выйти</span>
        <kbd>Esc</kbd>
      </button>
    </section>
  );
}
