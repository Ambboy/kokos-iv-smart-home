import {
  ArrowCounterClockwise,
  PencilSimpleLine,
  Trash,
  X,
} from "@phosphor-icons/react";

export function EditorPanel({
  active,
  wallCount = 0,
  hiddenFurnitureCount = 0,
  onToggle,
  onUndoWall,
  onReset,
}) {
  return (
    <aside className="ui-editor" data-active={active} aria-label="Редактор модели">
      <button
        type="button"
        className="ui-editor-trigger"
        aria-expanded={active}
        onClick={() => onToggle?.(!active)}
      >
        {active ? <X aria-hidden="true" size={18} /> : <PencilSimpleLine aria-hidden="true" size={18} />}
        <span>{active ? "Закончить" : "Редактировать"}</span>
      </button>

      {active ? (
        <div className="ui-editor-body">
          <strong>Правка планировки</strong>
          <p>Два раза коснитесь пола: начало и конец новой стены.</p>
          <p>Коснитесь предмета мебели, чтобы убрать его из модели.</p>
          <div className="ui-editor-stats" aria-label="Внесённые изменения">
            <span>Стен: {wallCount}</span>
            <span>Скрыто: {hiddenFurnitureCount}</span>
          </div>
          <div className="ui-editor-actions">
            <button type="button" disabled={wallCount === 0} onClick={onUndoWall}>
              <ArrowCounterClockwise aria-hidden="true" size={17} />
              Отменить стену
            </button>
            <button
              type="button"
              disabled={wallCount === 0 && hiddenFurnitureCount === 0}
              onClick={onReset}
            >
              <Trash aria-hidden="true" size={17} />
              Сбросить правки
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
