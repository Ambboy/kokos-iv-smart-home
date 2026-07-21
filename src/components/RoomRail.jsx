import { useEffect, useRef } from "react";

const AREA_FORMATTER = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const CONFIDENCE_LABELS = {
  confirmed: "Подтверждено проектом",
  provisional: "Требует подтверждения",
  proxy: "Прокси-геометрия",
};

/**
 * @typedef {Object} RoomRailItem
 * @property {string} id
 * @property {string} name
 * @property {number} [area] Площадь в квадратных метрах.
 * @property {string} [areaLabel] Готовая подпись площади, если число неприменимо.
 * @property {"confirmed"|"provisional"|"proxy"} [confidence]
 * @property {boolean} [disabled]
 */

/**
 * @typedef {Object} RoomRailProps
 * @property {RoomRailItem[]} rooms
 * @property {string|null} selectedRoomId
 * @property {(roomId: string) => void} onSelectRoom
 * @property {string} [title]
 * @property {string} [emptyMessage]
 */

function formatArea(room) {
  if (room.areaLabel) return room.areaLabel;
  if (Number.isFinite(room.area)) return `${AREA_FORMATTER.format(room.area)} м²`;
  return "Площадь уточняется";
}

/** @param {RoomRailProps} props */
export function RoomRail({
  rooms = [],
  selectedRoomId = null,
  onSelectRoom,
  title = "Помещения",
  emptyMessage = "Помещения не загружены",
}) {
  const listRef = useRef(null);

  useEffect(() => {
    const selected = listRef.current?.querySelector('[aria-pressed="true"]');
    selected?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
  }, [selectedRoomId]);

  return (
    <aside className="ui-room-rail" aria-label={title}>
      <div className="ui-panel-heading ui-room-rail-heading">
        <h2>{title}</h2>
        <span className="ui-count" aria-label={`Помещений: ${rooms.length}`}>
          {rooms.length}
        </span>
      </div>

      {rooms.length > 0 ? (
        <nav ref={listRef} className="ui-room-list" aria-label="Выбор помещения">
          {rooms.map((room) => {
            const selected = room.id === selectedRoomId;
            const confidence = room.confidence ?? "confirmed";
            const confidenceLabel =
              CONFIDENCE_LABELS[confidence] ?? CONFIDENCE_LABELS.provisional;
            const areaLabel = formatArea(room);
            const accessibleLabel = `${room.name}, ${areaLabel}. Достоверность: ${confidenceLabel}`;

            return (
              <button
                key={room.id}
                type="button"
                className="ui-room-button"
                data-confidence={confidence}
                aria-pressed={selected}
                aria-label={accessibleLabel}
                title={accessibleLabel}
                disabled={room.disabled}
                onClick={() => onSelectRoom?.(room.id)}
              >
                <span className="ui-room-main">
                  <span className="ui-room-name">{room.name}</span>
                  <span className="ui-room-area">{areaLabel}</span>
                </span>
                <span
                  className="ui-confidence-dot"
                  data-confidence={confidence}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </nav>
      ) : (
        <p className="ui-empty-state">{emptyMessage}</p>
      )}

      <div className="ui-provenance-legend ui-room-provenance" aria-label="Легенда достоверности помещений">
        {Object.entries(CONFIDENCE_LABELS).map(([confidence, label]) => (
          <span key={confidence} className="ui-provenance-item">
            <span
              className="ui-confidence-dot"
              data-confidence={confidence}
              aria-hidden="true"
            />
            <span>{label}</span>
          </span>
        ))}
      </div>
    </aside>
  );
}
