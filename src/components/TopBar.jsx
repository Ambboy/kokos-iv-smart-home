import {
  CircleNotch,
  HouseLine,
  WifiHigh,
  WifiSlash,
} from "@phosphor-icons/react";

const CONNECTION_META = {
  online: {
    label: "Подключено",
    Icon: WifiHigh,
  },
  connecting: {
    label: "Подключение",
    Icon: CircleNotch,
  },
  offline: {
    label: "Не в сети",
    Icon: WifiSlash,
  },
  demo: {
    label: "Демо-контур",
    Icon: WifiHigh,
  },
};

/**
 * @typedef {Object} TopBarProps
 * @property {string} projectName Видимое название нового объекта.
 * @property {string} [subtitle] Короткое описание текущего представления.
 * @property {"online"|"connecting"|"offline"|"demo"} [connectionStatus]
 * @property {string} [connectionLabel] Необязательная замена стандартной подписи связи.
 * @property {boolean} [demoMode] Показывает, что команды исполняются в эмуляторе.
 * @property {() => void} [onConnectionClick] Если передан, индикатор связи становится кнопкой.
 */

/** @param {TopBarProps} props */
export function TopBar({
  projectName,
  subtitle = "Интерактивная 3D-панель",
  connectionStatus = "demo",
  connectionLabel,
  demoMode = true,
  onConnectionClick,
}) {
  const meta = CONNECTION_META[connectionStatus] ?? CONNECTION_META.offline;
  const statusLabel = connectionLabel ?? meta.label;
  const StatusIcon = meta.Icon;
  const statusContent = (
    <>
      <StatusIcon
        aria-hidden="true"
        className={connectionStatus === "connecting" ? "ui-spin" : undefined}
        size={17}
        weight="bold"
      />
      <span className="ui-connection-label">{statusLabel}</span>
    </>
  );

  return (
    <header className="ui-topbar">
      <div className="ui-project-identity">
        <span className="ui-project-mark" aria-hidden="true">
          <HouseLine size={22} weight="regular" />
        </span>
        <span className="ui-project-copy">
          <strong className="ui-project-name">{projectName}</strong>
          <span className="ui-project-subtitle">{subtitle}</span>
        </span>
      </div>

      <div className="ui-topbar-statuses">
        {demoMode ? (
          <span className="ui-demo-badge" title="Команды подтверждаются эмулятором">
            Демо
          </span>
        ) : null}

        {onConnectionClick ? (
          <button
            type="button"
            className="ui-connection-status"
            data-status={connectionStatus}
            onClick={onConnectionClick}
            aria-label={`Состояние подключения: ${statusLabel}`}
          >
            {statusContent}
          </button>
        ) : (
          <span
            className="ui-connection-status"
            data-status={connectionStatus}
            role="status"
            aria-label={`Состояние подключения: ${statusLabel}`}
          >
            {statusContent}
          </span>
        )}
      </div>
    </header>
  );
}
