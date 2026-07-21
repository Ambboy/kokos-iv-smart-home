import {
  CheckCircle,
  Circle,
  CircleNotch,
  DoorOpen,
  Lightbulb,
  Power,
  Thermometer,
  WarningCircle,
  WifiSlash,
  Wind,
  X,
} from "@phosphor-icons/react";

const COMMAND_STATE_META = {
  idle: { label: "Готово", Icon: Circle },
  pending: { label: "Ожидание", Icon: CircleNotch },
  confirmed: { label: "Подтверждено", Icon: CheckCircle },
  error: { label: "Ошибка", Icon: WarningCircle },
  offline: { label: "Не в сети", Icon: WifiSlash },
};

const DEVICE_KIND_META = {
  light: { label: "Освещение", Icon: Lightbulb },
  curtain: { label: "Шторы", Icon: DoorOpen },
  climate: { label: "Климат", Icon: Thermometer },
  ventilation: { label: "Вентиляция", Icon: Wind },
  switch: { label: "Выключатель", Icon: Power },
};

const CONFIDENCE_LABELS = {
  provisional: "Требует подтверждения",
  proxy: "Прокси",
};

/**
 * @typedef {Object} ToggleControl
 * @property {"toggle"} type
 * @property {boolean} value
 * @property {string} [action] По умолчанию `setPower`.
 * @property {string} [onLabel]
 * @property {string} [offLabel]
 */

/**
 * @typedef {Object} RangeControl
 * @property {"range"} type
 * @property {number} value
 * @property {number} min
 * @property {number} max
 * @property {number} [step]
 * @property {string} [unit]
 * @property {string} [label]
 * @property {string} [action] По умолчанию `setValue`.
 */

/**
 * @typedef {Object} ActionOption
 * @property {string} id
 * @property {string} label
 * @property {string} action
 * @property {unknown} [value]
 */

/**
 * @typedef {Object} ActionsControl
 * @property {"actions"} type
 * @property {ActionOption[]} options
 */

/**
 * @typedef {Object} ReadonlyControl
 * @property {"readonly"} type
 * @property {string|number} value
 * @property {string} [unit]
 * @property {string} [label]
 */

/** @typedef {ToggleControl|RangeControl|ActionsControl|ReadonlyControl} DeviceControl */

/**
 * @typedef {Object} DevicePanelItem
 * @property {string} id Стабильный deviceId.
 * @property {string} name
 * @property {"light"|"curtain"|"climate"|"ventilation"|"switch"|string} kind
 * @property {"idle"|"pending"|"confirmed"|"error"|"offline"} [commandState]
 * @property {DeviceControl} control
 * @property {string} [roomId]
 * @property {string} [visualObjectId] Стабильная связь с видимым объектом сцены.
 * @property {"confirmed"|"provisional"|"proxy"} [confidence]
 * @property {string} [detail]
 */

/**
 * @typedef {Object} DeviceCommand
 * @property {string} deviceId
 * @property {string|undefined} roomId
 * @property {string} action
 * @property {unknown} value
 */

/**
 * @typedef {Object} DevicePanelProps
 * @property {{id: string, name: string}|null} room
 * @property {DevicePanelItem[]} devices
 * @property {(command: DeviceCommand) => void} onCommand
 * @property {() => void} [onClose]
 * @property {boolean} [demoMode]
 * @property {string} [announcement] Текст для вежливого live-region.
 */

function normalizeCommandState(state) {
  return COMMAND_STATE_META[state] ? state : "idle";
}

function emitCommand(onCommand, room, device, action, value) {
  onCommand?.({
    deviceId: device.id,
    roomId: device.roomId ?? room?.id,
    action,
    value,
  });
}

function DeviceControlView({ device, room, onCommand }) {
  const control = device.control;
  const state = normalizeCommandState(device.commandState);
  const disabled = state === "pending" || state === "offline";

  if (!control) return null;

  if (control.type === "toggle") {
    const stateLabel = control.value
      ? control.onLabel ?? "Включено"
      : control.offLabel ?? "Выключено";

    return (
      <button
        type="button"
        className="ui-device-toggle"
        aria-pressed={control.value}
        disabled={disabled}
        onClick={() =>
          emitCommand(
            onCommand,
            room,
            device,
            control.action ?? "setPower",
            !control.value,
          )
        }
      >
        <Power aria-hidden="true" size={18} weight={control.value ? "fill" : "regular"} />
        <span>{stateLabel}</span>
      </button>
    );
  }

  if (control.type === "range") {
    const output = `${control.value}${control.unit ?? ""}`;

    return (
      <div className="ui-range-control">
        <div className="ui-range-meta">
          <label htmlFor={`device-${device.id}-range`}>
            {control.label ?? "Значение"}
          </label>
          <output htmlFor={`device-${device.id}-range`}>{output}</output>
        </div>
        <input
          id={`device-${device.id}-range`}
          type="range"
          min={control.min}
          max={control.max}
          step={control.step ?? 1}
          value={control.value}
          disabled={state === "offline"}
          aria-busy={state === "pending"}
          onChange={(event) =>
            emitCommand(
              onCommand,
              room,
              device,
              control.action ?? "setValue",
              Number(event.currentTarget.value),
            )
          }
        />
      </div>
    );
  }

  if (control.type === "actions") {
    return (
      <div className="ui-device-actions" role="group" aria-label={`Управление: ${device.name}`}>
        {control.options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            onClick={() =>
              emitCommand(onCommand, room, device, option.action, option.value)
            }
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  }

  if (control.type === "readonly") {
    return (
      <div className="ui-readonly-value">
        <span>{control.label ?? "Текущее значение"}</span>
        <output>{`${control.value}${control.unit ?? ""}`}</output>
      </div>
    );
  }

  return null;
}

/** @param {DevicePanelProps} props */
export function DevicePanel({
  room,
  devices = [],
  onCommand,
  onClose,
  demoMode = true,
  announcement,
}) {
  const pendingCount = devices.filter(
    (device) => normalizeCommandState(device.commandState) === "pending",
  ).length;
  const liveText =
    announcement ??
    (pendingCount > 0
      ? `Команд в ожидании подтверждения: ${pendingCount}`
      : "Панель устройств готова");

  return (
    <aside className="ui-device-panel" aria-label="Устройства выбранного помещения">
      <div className="ui-device-panel-header">
        <h2>{room?.name ?? "Выберите помещение"}</h2>
        {onClose ? (
          <button
            type="button"
            className="ui-icon-button"
            onClick={onClose}
            aria-label="Закрыть панель устройств"
          >
            <X aria-hidden="true" size={19} />
          </button>
        ) : null}
      </div>

      {demoMode ? (
        <p className="ui-demo-note">
          Демо-режим. Подтверждение команд эмулируется без подключения к объекту.
        </p>
      ) : null}

      <span className="ui-visually-hidden" role="status" aria-live="polite">
        {liveText}
      </span>

      {!room ? (
        <p className="ui-empty-state">
          Выберите помещение в списке или нажмите на него в 3D-сцене.
        </p>
      ) : devices.length === 0 ? (
        <p className="ui-empty-state">
          Для этого помещения управляемые устройства не описаны.
        </p>
      ) : (
        <div className="ui-device-list">
          {devices.map((device) => {
            const kindMeta = DEVICE_KIND_META[device.kind] ?? {
              label: "Устройство",
              Icon: Power,
            };
            const state = normalizeCommandState(device.commandState);
            const stateMeta = COMMAND_STATE_META[state];
            const DeviceIcon = kindMeta.Icon;
            const StateIcon = stateMeta.Icon;
            const confidenceLabel = CONFIDENCE_LABELS[device.confidence];

            return (
              <article
                key={device.id}
                className="ui-device-row"
                data-command-state={state}
                aria-busy={state === "pending"}
              >
                <div className="ui-device-row-heading">
                  <span className="ui-device-kind-icon" aria-hidden="true">
                    <DeviceIcon size={20} />
                  </span>
                  <span className="ui-device-copy">
                    <strong>{device.name}</strong>
                    <span>{device.detail ?? kindMeta.label}</span>
                  </span>
                  <span className="ui-command-state" data-state={state}>
                    <StateIcon
                      aria-hidden="true"
                      className={state === "pending" ? "ui-spin" : undefined}
                      size={15}
                      weight={state === "confirmed" ? "fill" : "regular"}
                    />
                    <span>{stateMeta.label}</span>
                  </span>
                </div>

                {confidenceLabel ? (
                  <span className="ui-source-flag" data-confidence={device.confidence}>
                    {confidenceLabel}
                  </span>
                ) : null}

                <DeviceControlView device={device} room={room} onCommand={onCommand} />
              </article>
            );
          })}
        </div>
      )}
    </aside>
  );
}
