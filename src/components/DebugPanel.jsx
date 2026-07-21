import { useId } from "react";
import {
  BoundingBox,
  Bug,
  CheckCircle,
  CircleNotch,
  DoorOpen,
  Eye,
  ImageSquare,
  WarningCircle,
  X,
} from "@phosphor-icons/react";

const OPTION_ICONS = {
  bounds: BoundingBox,
  collisions: WarningCircle,
  doorArcs: DoorOpen,
  sourceOverlay: ImageSquare,
};

const VALIDATOR_META = {
  idle: { label: "Не запускался", Icon: Bug },
  running: { label: "Проверка", Icon: CircleNotch },
  valid: { label: "Коллизий нет", Icon: CheckCircle },
  warning: { label: "Есть замечания", Icon: WarningCircle },
  error: { label: "Проверка не пройдена", Icon: X },
};

/**
 * @typedef {Object} DebugOption
 * @property {string} id
 * @property {string} label
 * @property {boolean} enabled
 * @property {string} [description]
 * @property {boolean} [disabled]
 */

/**
 * @typedef {Object} CollisionItem
 * @property {string} id
 * @property {string} label
 * @property {string} [detail]
 * @property {"warning"|"error"} [severity]
 */

/**
 * @typedef {Object} DebugPanelProps
 * @property {boolean} open
 * @property {(open: boolean) => void} onOpenChange
 * @property {DebugOption[]} [options]
 * @property {(optionId: string, enabled: boolean) => void} [onToggle]
 * @property {CollisionItem[]} [collisions]
 * @property {"idle"|"running"|"valid"|"warning"|"error"} [validatorStatus]
 * @property {number} [sourceOverlayOpacity] Значение от 0 до 1.
 * @property {(opacity: number) => void} [onSourceOverlayOpacityChange]
 */

/** @param {DebugPanelProps} props */
export function DebugPanel({
  open,
  onOpenChange,
  options = [],
  onToggle,
  collisions = [],
  validatorStatus = "idle",
  sourceOverlayOpacity,
  onSourceOverlayOpacityChange,
}) {
  const bodyId = useId();
  const validatorMeta = VALIDATOR_META[validatorStatus] ?? VALIDATOR_META.idle;
  const ValidatorIcon = validatorMeta.Icon;

  return (
    <aside className="ui-debug-panel" data-open={open} aria-label="Отладка геометрии">
      <button
        type="button"
        className="ui-debug-trigger"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => onOpenChange?.(!open)}
      >
        <Bug aria-hidden="true" size={19} />
        <span>Отладка</span>
        {collisions.length > 0 ? (
          <span className="ui-debug-count" aria-label={`Коллизий: ${collisions.length}`}>
            {collisions.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div id={bodyId} className="ui-debug-body">
          <div className="ui-debug-heading">
            <h2>Отладочный режим</h2>
            <button
              type="button"
              className="ui-icon-button"
              onClick={() => onOpenChange?.(false)}
              aria-label="Закрыть отладочную панель"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>

          <div className="ui-debug-options">
            {options.map((option) => {
              const OptionIcon = OPTION_ICONS[option.id] ?? Eye;
              return (
                <label key={option.id} className="ui-debug-option">
                  <span className="ui-debug-option-icon" aria-hidden="true">
                    <OptionIcon size={18} />
                  </span>
                  <span className="ui-debug-option-copy">
                    <strong>{option.label}</strong>
                    {option.description ? <span>{option.description}</span> : null}
                  </span>
                  <input
                    type="checkbox"
                    checked={option.enabled}
                    disabled={option.disabled}
                    onChange={(event) => onToggle?.(option.id, event.currentTarget.checked)}
                  />
                </label>
              );
            })}
          </div>

          {Number.isFinite(sourceOverlayOpacity) ? (
            <div className="ui-debug-opacity">
              <div className="ui-range-meta">
                <label htmlFor={`${bodyId}-opacity`}>Прозрачность плана</label>
                <output htmlFor={`${bodyId}-opacity`}>
                  {Math.round(sourceOverlayOpacity * 100)}%
                </output>
              </div>
              <input
                id={`${bodyId}-opacity`}
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={sourceOverlayOpacity}
                onChange={(event) =>
                  onSourceOverlayOpacityChange?.(Number(event.currentTarget.value))
                }
              />
            </div>
          ) : null}

          <div className="ui-validator-status" data-status={validatorStatus} role="status">
            <ValidatorIcon
              aria-hidden="true"
              className={validatorStatus === "running" ? "ui-spin" : undefined}
              size={17}
            />
            <span>{validatorMeta.label}</span>
          </div>

          {collisions.length > 0 ? (
            <ul className="ui-collision-list" aria-label="Найденные пересечения">
              {collisions.map((collision) => (
                <li key={collision.id} data-severity={collision.severity ?? "error"}>
                  <WarningCircle aria-hidden="true" size={16} />
                  <span>
                    <strong>{collision.label}</strong>
                    {collision.detail ? <span>{collision.detail}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
