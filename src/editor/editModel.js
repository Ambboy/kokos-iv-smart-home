export const EDITOR_STORAGE_KEY = "kokos-iv-scene-edits-v1";

export function persistEditorState(getStorage, state) {
  try {
    const storage = typeof getStorage === "function" ? getStorage() : getStorage;
    storage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(normalizeEditorState(state)));
    return true;
  } catch {
    return false;
  }
}

function validPoint(point) {
  return Array.isArray(point)
    && point.length === 2
    && point.every((coordinate) => Number.isFinite(coordinate) && Math.abs(coordinate) < 100);
}

export function isValidWallEdit(wall) {
  return /^edit-wall-[a-z0-9-]+$/i.test(wall?.id ?? "")
    && validPoint(wall.start)
    && validPoint(wall.end)
    && Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]) >= 0.15;
}

function normalizeWalls(walls) {
  if (!Array.isArray(walls)) return [];
  const ids = new Set();
  const normalized = [];
  walls.forEach((wall) => {
    if (!isValidWallEdit(wall) || ids.has(wall.id)) return;
    ids.add(wall.id);
    normalized.push({ id: wall.id, start: [...wall.start], end: [...wall.end] });
  });
  return normalized;
}

export function normalizeEditorState(value) {
  return {
    walls: normalizeWalls(value?.walls),
    hiddenFurnitureIds: Array.isArray(value?.hiddenFurnitureIds)
      ? [...new Set(value.hiddenFurnitureIds.filter((id) => typeof id === "string" && id.length > 0))]
      : [],
  };
}

export function appendWallEdit(state, wall) {
  const current = normalizeEditorState(state);
  const candidate = normalizeWalls([wall])[0];
  if (!candidate) return current;
  return normalizeEditorState({ ...current, walls: [...current.walls, candidate] });
}

export function hideFurnitureEdit(state, furnitureId) {
  const current = normalizeEditorState(state);
  if (!furnitureId || current.hiddenFurnitureIds.includes(furnitureId)) return current;
  return { ...current, hiddenFurnitureIds: [...current.hiddenFurnitureIds, furnitureId] };
}

export function removeLastWallEdit(state) {
  const current = normalizeEditorState(state);
  return { ...current, walls: current.walls.slice(0, -1) };
}

export function applySceneEdits(manifest, state) {
  const current = normalizeEditorState(state);
  const edited = structuredClone(manifest);
  const source = edited.sources.find((item) => item.pdfPage === 24) ?? edited.sources[0];
  edited.walls.push(...current.walls.map((wall) => ({
    id: wall.id,
    start: [...wall.start],
    end: [...wall.end],
    height: 3.405,
    thickness: 0.12,
    materialId: "wall-warm-greige",
    source,
    sourceRefs: source ? [source] : [],
    confidence: "provisional",
    parameterConfidence: {
      centerlineXZ: "user-edited",
      height: "provisional",
      thickness: "provisional",
    },
  })));
  const hidden = new Set(current.hiddenFurnitureIds);
  edited.furniture = edited.furniture.filter((item) => !hidden.has(item.id));
  edited.allowedContacts = (edited.allowedContacts ?? [])
    .map((contact) => contact.objectIds
      ? { ...contact, objectIds: contact.objectIds.filter((id) => !hidden.has(id)) }
      : contact)
    .filter((contact) => !contact.objectIds || contact.objectIds.length > 0);
  return edited;
}
