import {
  AirplaneTilt,
  CircleNotch,
  MoonStars,
  Sun,
} from "@phosphor-icons/react";

export const DEFAULT_SCENARIOS = [
  { id: "day", label: "День", Icon: Sun },
  { id: "evening", label: "Вечер", Icon: MoonStars },
  { id: "away", label: "Нет дома", Icon: AirplaneTilt },
];

/**
 * @typedef {Object} ScenarioItem
 * @property {string} id
 * @property {string} label
 * @property {import("react").ComponentType<{size?: number, weight?: string, "aria-hidden"?: boolean}>} [Icon]
 * @property {boolean} [disabled]
 */

/**
 * @typedef {Object} ScenarioBarProps
 * @property {ScenarioItem[]} [scenarios]
 * @property {string|null} activeScenarioId
 * @property {string|null} [pendingScenarioId]
 * @property {(scenarioId: string) => void} onSelect
 * @property {boolean} [disabled]
 */

/** @param {ScenarioBarProps} props */
export function ScenarioBar({
  scenarios = DEFAULT_SCENARIOS,
  activeScenarioId = null,
  pendingScenarioId = null,
  onSelect,
  disabled = false,
}) {
  return (
    <section className="ui-scenario-bar" aria-label="Сценарии квартиры">
      <span className="ui-scenario-title">Сценарий</span>
      <div className="ui-scenario-actions">
        {scenarios.map((scenario) => {
          const ScenarioIcon = scenario.Icon;
          const active = scenario.id === activeScenarioId;
          const pending = scenario.id === pendingScenarioId;

          return (
            <button
              key={scenario.id}
              type="button"
              className="ui-scenario-button"
              data-state={pending ? "pending" : active ? "active" : "idle"}
              aria-pressed={active}
              aria-busy={pending}
              disabled={disabled || scenario.disabled || pending}
              onClick={() => onSelect?.(scenario.id)}
            >
              {pending ? (
                <CircleNotch className="ui-spin" aria-hidden="true" size={18} />
              ) : ScenarioIcon ? (
                <ScenarioIcon aria-hidden="true" size={18} weight={active ? "fill" : "regular"} />
              ) : null}
              <span>{scenario.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
