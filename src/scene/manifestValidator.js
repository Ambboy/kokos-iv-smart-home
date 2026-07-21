import {
  classifyPointInPolygon,
  buildFurnitureColliders,
  obbFootprint,
  polygonArea,
  polygonContainsPolygon,
  polygonSelfIntersects,
  polygonsInteriorOverlap,
  validateCollisionStages,
  validateManifestCollisions,
} from "./collisionValidator.js";

export const VALIDATION_DEFAULTS = Object.freeze({
  epsilon: 1e-6,
  perRoomAreaAbsoluteToleranceM2: 0.05,
  perRoomAreaRelativeTolerance: 0.01,
  totalAreaAbsoluteToleranceM2: 0.1,
  totalAreaRelativeTolerance: 0.01,
});

const DEVICE_STATES = new Set(["idle", "pending", "confirmed", "error", "offline"]);
const DEVICE_KINDS = new Set(["light", "curtain", "climate"]);
const CONFIDENCE = new Set(["confirmed", "provisional", "proxy"]);
const finite = Number.isFinite;

function makeIssue(code, severity, path, message, entityIds = [], sourceRefs = []) {
  return { code, severity, path, message, entityIds, sourceRefs };
}

function sourceRef(source) {
  return source ? [{ file: source.file, sheet: source.sheet, pdfPage: source.pdfPage }] : [];
}

function sourceKey(source) {
  return `${source?.file ?? ""}\u0000${source?.sheet ?? ""}\u0000${source?.pdfPage ?? ""}`;
}

function isFiniteTuple(value, length) {
  return Array.isArray(value) && value.length === length && value.every(finite);
}

function wallLength(wall) {
  if (!isFiniteTuple(wall?.start, 2) || !isFiniteTuple(wall?.end, 2)) return Number.NaN;
  return Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
}

function add(issues, code, severity, path, message, entityIds = [], source = undefined) {
  issues.push(makeIssue(code, severity, path, message, entityIds, sourceRef(source)));
}

function validateSource(issues, source, path, entityId = undefined) {
  const ids = entityId ? [entityId] : [];
  if (!source || typeof source !== "object") {
    add(issues, "SOURCE_MISSING", "error", path, "A source object is required.", ids);
    return;
  }
  if (typeof source.file !== "string" || source.file.trim() === "") add(issues, "SOURCE_FILE_INVALID", "error", `${path}.file`, "Source file must be a non-empty string.", ids);
  if (typeof source.sheet !== "string" || source.sheet.trim() === "") add(issues, "SOURCE_SHEET_INVALID", "error", `${path}.sheet`, "Source sheet/title must be a non-empty string.", ids);
  if (!Number.isInteger(source.pdfPage) || source.pdfPage <= 0) add(issues, "SOURCE_PDF_PAGE_INVALID", "error", `${path}.pdfPage`, "Physical PDF page must be a positive integer.", ids);
}

function validateConfidence(issues, entity, path) {
  if (!CONFIDENCE.has(entity?.confidence)) add(issues, "CONFIDENCE_INVALID", "error", `${path}.confidence`, `Unknown confidence value ${String(entity?.confidence)}.`, entity?.id ? [entity.id] : [], entity?.source);
}

function entityCollections(manifest) {
  const collections = [
    ["shell", manifest.shell ? [manifest.shell] : []],
    ["rooms", manifest.rooms ?? []],
    ["walls", manifest.walls ?? []],
    ["doors", manifest.doors ?? []],
    ["glazing", manifest.glazing ?? []],
    ["openPassages", manifest.openPassages ?? []],
    ["furniture", manifest.furniture ?? []],
    ["unplacedItems", manifest.unplacedItems ?? []],
    ["lights", manifest.lights ?? []],
    ["curtains", manifest.curtains ?? []],
    ["devices", manifest.devices ?? []],
    ["materials", manifest.materials ?? []],
    ["scenarios", manifest.scenarios ?? []],
    ["allowedContacts", manifest.allowedContacts ?? []],
  ];
  for (let groupIndex = 0; groupIndex < (manifest.lights ?? []).length; groupIndex += 1) {
    collections.push([`lights[${groupIndex}].fixtures`, manifest.lights[groupIndex].fixtures ?? []]);
  }
  return collections;
}

function validateIdentity(issues, manifest) {
  const seen = new Map();
  for (const [collection, entities] of entityCollections(manifest)) {
    entities.forEach((entity, index) => {
      const path = collection === "shell" ? "shell" : `${collection}[${index}]`;
      if (!entity || typeof entity !== "object") {
        add(issues, "ENTITY_INVALID", "error", path, "Manifest entity must be an object.");
        return;
      }
      if (typeof entity.id !== "string" || entity.id.trim() === "") {
        add(issues, "ID_MISSING", "error", `${path}.id`, "Every entity must have a stable non-empty id.");
        return;
      }
      const previous = seen.get(entity.id);
      if (previous) add(issues, "ID_DUPLICATE", "error", `${path}.id`, `Duplicate id ${entity.id}; first declared at ${previous}.`, [entity.id], entity.source);
      else seen.set(entity.id, path);
    });
  }
}

function validateMeta(issues, manifest) {
  if (!manifest.meta || typeof manifest.meta !== "object") {
    add(issues, "META_MISSING", "error", "meta", "Project metadata is required.");
    return;
  }
  if (manifest.meta.units !== "m") add(issues, "UNITS_INVALID", "error", "meta.units", "Manifest units must be metres (m).");
  if (!(finite(manifest.meta.totalReportedArea) && manifest.meta.totalReportedArea > 0)) add(issues, "TOTAL_AREA_INVALID", "error", "meta.totalReportedArea", "Reported total area must be finite and positive.");
  if (!(Number.isInteger(manifest.meta.sourcePdfPhysicalPages) && manifest.meta.sourcePdfPhysicalPages > 0)) add(issues, "PDF_PAGE_COUNT_INVALID", "error", "meta.sourcePdfPhysicalPages", "Physical PDF page count must be a positive integer.");
  if (!manifest.coordinateSystem || manifest.coordinateSystem.floorPlane !== "X/Z" || manifest.coordinateSystem.verticalAxis !== "Y") add(issues, "COORDINATE_SYSTEM_INVALID", "error", "coordinateSystem", "Coordinate system must use X/Z for the floor and Y for height.");
  if (manifest.coordinateSystem && manifest.coordinateSystem.scale !== 1) add(issues, "COORDINATE_SCALE_INVALID", "error", "coordinateSystem.scale", "Coordinate scale must remain 1 metre per unit.");
  if (manifest.coordinateSystem?.source) validateSource(issues, manifest.coordinateSystem.source, "coordinateSystem.source", "coordinate-system");
}

function validateSourceRegistry(issues, manifest) {
  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    add(issues, "SOURCE_REGISTRY_EMPTY", "error", "sources", "At least one project source is required.");
    return;
  }
  const registered = new Set();
  manifest.sources.forEach((source, index) => {
    validateSource(issues, source, `sources[${index}]`);
    if (source && typeof source === "object") {
      const key = sourceKey(source);
      if (registered.has(key)) add(issues, "SOURCE_REGISTRY_DUPLICATE", "warning", `sources[${index}]`, "Source registry contains a duplicate file/sheet/page reference.");
      registered.add(key);
      if (Number.isInteger(source.pdfPage) && Number.isInteger(manifest.meta?.sourcePdfPhysicalPages) && source.pdfPage > manifest.meta.sourcePdfPhysicalPages) add(issues, "SOURCE_PDF_PAGE_OUT_OF_RANGE", "error", `sources[${index}].pdfPage`, `Source page ${source.pdfPage} exceeds the ${manifest.meta.sourcePdfPhysicalPages}-page PDF.`);
    }
  });
  const checkRegistration = (source, path, entityId) => {
    if (source && typeof source === "object" && !registered.has(sourceKey(source))) add(issues, "SOURCE_NOT_REGISTERED", "error", path, `Source for ${entityId ?? path} is not listed in the project source registry.`, entityId ? [entityId] : [], source);
  };
  if (manifest.coordinateSystem?.source) checkRegistration(manifest.coordinateSystem.source, "coordinateSystem.source", "coordinate-system");
  for (const [collection, entities] of entityCollections(manifest)) {
    entities.forEach((entity, index) => {
      if (collection === "devices" && entity.kind === "climate" && entity.source) {
        validateSource(issues, entity.source, `${collection}[${index}].source`, entity.id);
        checkRegistration(entity.source, `${collection}[${index}].source`, entity.id);
        return;
      }
      if (entity.source) {
        validateSource(issues, entity.source, `${collection}[${index}].source`, entity.id);
        checkRegistration(entity.source, `${collection}[${index}].source`, entity.id);
      }
      else if (!["materials", "scenarios", "allowedContacts"].includes(collection)) add(issues, "SOURCE_MISSING", "error", `${collection}[${index}].source`, `Entity ${entity.id} has no source.`, [entity.id]);
      (entity.sourceRefs ?? []).forEach((item, sourceIndex) => {
        const sourcePath = `${collection}[${index}].sourceRefs[${sourceIndex}]`;
        validateSource(issues, item, sourcePath, entity.id);
        checkRegistration(item, sourcePath, entity.id);
      });
    });
  }
}

function validatePolygon(issues, polygon, path, ownerId, severity = "error", source = undefined) {
  if (!Array.isArray(polygon) || polygon.length < 3) {
    add(issues, "POLYGON_INVALID", severity, path, "Polygon must contain at least three points.", [ownerId], source);
    return false;
  }
  if (!polygon.every((point) => isFiniteTuple(point, 2))) {
    add(issues, "POLYGON_NON_FINITE", severity, path, "Polygon contains invalid or non-finite points.", [ownerId], source);
    return false;
  }
  if (!(polygonArea(polygon) > 0)) {
    add(issues, "POLYGON_ZERO_AREA", severity, path, "Polygon area must be positive.", [ownerId], source);
    return false;
  }
  if (polygonSelfIntersects(polygon)) {
    add(issues, "POLYGON_SELF_INTERSECTION", severity, path, "Polygon intersects itself.", [ownerId], source);
    return false;
  }
  for (let index = 0; index < polygon.length; index += 1) {
    const next = polygon[(index + 1) % polygon.length];
    if (Math.hypot(next[0] - polygon[index][0], next[1] - polygon[index][1]) <= 1e-6) {
      add(issues, "POLYGON_DUPLICATE_VERTEX", severity, `${path}[${index}]`, "Polygon contains a duplicate consecutive vertex.", [ownerId], source);
    }
  }
  return true;
}

function validateShellAndRooms(issues, manifest, options) {
  const shell = manifest.shell;
  if (!shell || typeof shell !== "object") {
    add(issues, "SHELL_MISSING", "error", "shell", "Apartment shell is required.");
    return;
  }
  validateConfidence(issues, shell, "shell");
  validateSource(issues, shell.source, "shell.source", shell.id);
  const shellValid = validatePolygon(issues, shell.exterior, "shell.exterior", shell.id, "error", shell.source);
  if (shell.confidence === "provisional") add(issues, "PROVISIONAL_SHELL", "warning", "shell.confidence", "Shell is explicitly provisional; collision and containment results depend on this reconstruction.", [shell.id], shell.source);
  if (!(finite(shell.rawSlabHeight) && shell.rawSlabHeight > 0)) add(issues, "SHELL_HEIGHT_INVALID", "error", "shell.rawSlabHeight", "Raw slab height must be finite and positive.", [shell.id], shell.source);

  const rooms = manifest.rooms ?? [];
  if (rooms.length === 0) add(issues, "ROOMS_EMPTY", "error", "rooms", "At least one room is required.");
  rooms.forEach((room, index) => {
    const path = `rooms[${index}]`;
    validateConfidence(issues, room, path);
    validateSource(issues, room.source, `${path}.source`, room.id);
    const polygonValid = validatePolygon(issues, room.polygon, `${path}.polygon`, room.id, "error", room.source);
    if (!(finite(room.reportedArea) && room.reportedArea > 0)) add(issues, "ROOM_AREA_INVALID", "error", `${path}.reportedArea`, "Room reported area must be finite and positive.", [room.id], room.source);
    if (!(finite(room.ceilingHeight) && room.ceilingHeight > 0)) add(issues, "ROOM_CEILING_INVALID", "error", `${path}.ceilingHeight`, "Room ceiling height must be finite and positive.", [room.id], room.source);
    if (!isFiniteTuple(room.focus, 3)) add(issues, "ROOM_FOCUS_INVALID", "error", `${path}.focus`, "Room focus must be a finite [x,y,z] point.", [room.id], room.source);
    if (shellValid && polygonValid && !polygonContainsPolygon(shell.exterior, room.polygon, options.epsilon)) add(issues, "ROOM_OUTSIDE_SHELL", "error", `${path}.polygon`, `Room ${room.id} is not contained by the reconstructed shell.`, [shell.id, room.id], room.source);
  });

  for (let aIndex = 0; aIndex < rooms.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < rooms.length; bIndex += 1) {
      const a = rooms[aIndex];
      const b = rooms[bIndex];
      if (Array.isArray(a.polygon) && Array.isArray(b.polygon) && polygonsInteriorOverlap(a.polygon, b.polygon, options.epsilon)) add(issues, "ROOM_OVERLAP", "error", "rooms", `Rooms ${a.id} and ${b.id} overlap in plan.`, [a.id, b.id]);
    }
  }
}

function validateWalls(issues, manifest) {
  const materials = new Set((manifest.materials ?? []).map((item) => item.id));
  (manifest.walls ?? []).forEach((wall, index) => {
    const path = `walls[${index}]`;
    validateConfidence(issues, wall, path);
    validateSource(issues, wall.source, `${path}.source`, wall.id);
    if (!isFiniteTuple(wall.start, 2) || !isFiniteTuple(wall.end, 2) || !(wallLength(wall) > 0)) add(issues, "WALL_GEOMETRY_INVALID", "error", path, "Wall endpoints must form a finite positive-length segment.", [wall.id], wall.source);
    if (!(finite(wall.height) && wall.height > 0)) add(issues, "WALL_HEIGHT_INVALID", "error", `${path}.height`, "Wall height must be finite and positive.", [wall.id], wall.source);
    if (!(finite(wall.thickness) && wall.thickness > 0)) add(issues, "WALL_THICKNESS_INVALID", "error", `${path}.thickness`, "Wall thickness must be finite and positive.", [wall.id], wall.source);
    if (!materials.has(wall.materialId)) add(issues, "MATERIAL_REF_UNKNOWN", "error", `${path}.materialId`, `Wall ${wall.id} references unknown material ${wall.materialId}.`, [wall.id, wall.materialId], wall.source);
  });
}

function allOpenings(manifest) {
  return [
    ...(manifest.doors ?? []).map((item, index) => ({ ...item, type: "door", path: `doors[${index}]`, bottom: 0 })),
    ...(manifest.openPassages ?? []).map((item, index) => ({ ...item, type: "passage", path: `openPassages[${index}]`, bottom: 0 })),
    ...(manifest.glazing ?? []).map((item, index) => ({ ...item, type: "glazing", path: `glazing[${index}]`, bottom: item.sill })),
  ];
}

function validateOpenings(issues, manifest, roomIds, wallById, options) {
  const openings = allOpenings(manifest);
  for (const opening of openings) {
    const wall = wallById.get(opening.wallId);
    validateConfidence(issues, opening, opening.path);
    validateSource(issues, opening.source, `${opening.path}.source`, opening.id);
    if (!wall) {
      add(issues, "OPENING_WALL_UNKNOWN", "error", `${opening.path}.wallId`, `${opening.id} references unknown wall ${opening.wallId}.`, [opening.id, opening.wallId], opening.source);
      continue;
    }
    if (![opening.offset, opening.width, opening.height, opening.bottom].every(finite) || opening.offset < 0 || !(opening.width > 0) || opening.bottom < 0 || !(opening.height > 0)) {
      add(issues, "OPENING_GEOMETRY_INVALID", "error", opening.path, `${opening.id} contains invalid opening dimensions.`, [opening.id, wall.id], opening.source);
      continue;
    }
    const length = wallLength(wall);
    if (opening.offset + opening.width > length + options.epsilon) add(issues, "OPENING_OUTSIDE_WALL", "error", opening.path, `${opening.id} extends ${(opening.offset + opening.width - length).toFixed(3)} m beyond ${wall.id}.`, [opening.id, wall.id], opening.source);
    if (opening.bottom + opening.height > wall.height + options.epsilon) add(issues, "OPENING_ABOVE_WALL", "error", opening.path, `${opening.id} exceeds wall ${wall.id} height.`, [opening.id, wall.id], opening.source);
    if (opening.roomId && !roomIds.has(opening.roomId)) add(issues, "ROOM_REF_UNKNOWN", "error", `${opening.path}.roomId`, `${opening.id} references unknown room ${opening.roomId}.`, [opening.id, opening.roomId], opening.source);
  }

  const byWall = new Map();
  for (const opening of openings) {
    if (![opening.offset, opening.width].every(finite)) continue;
    const entries = byWall.get(opening.wallId) ?? [];
    entries.push(opening);
    byWall.set(opening.wallId, entries);
  }
  for (const [wallId, entries] of byWall) {
    const sorted = entries.sort((a, b) => a.offset - b.offset);
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      const horizontalOverlap = previous.offset + previous.width - current.offset;
      const verticalOverlap = Math.min(previous.bottom + previous.height, current.bottom + current.height) - Math.max(previous.bottom, current.bottom);
      if (horizontalOverlap > options.epsilon && verticalOverlap > options.epsilon) add(issues, "OPENING_OVERLAP", "error", "openings", `${previous.id} and ${current.id} overlap on wall ${wallId}.`, [previous.id, current.id, wallId]);
    }
  }
}

function validateDoors(issues, manifest, roomIds, wallById, options) {
  (manifest.doors ?? []).forEach((door, index) => {
    const path = `doors[${index}]`;
    if (!wallById.has(door.wallId)) return;
    if (!Array.isArray(door.connects) || door.connects.length !== 2) add(issues, "DOOR_CONNECTIONS_INVALID", "error", `${path}.connects`, "Door must connect exactly two spaces.", [door.id], door.source);
    else door.connects.forEach((roomId) => {
      if (roomId !== "outside" && !roomIds.has(roomId)) add(issues, "ROOM_REF_UNKNOWN", "error", `${path}.connects`, `Door ${door.id} references unknown room ${roomId}.`, [door.id, roomId], door.source);
    });
    if (!roomIds.has(door.roomId)) add(issues, "ROOM_REF_UNKNOWN", "error", `${path}.roomId`, `Door ${door.id} references unknown room ${door.roomId}.`, [door.id, door.roomId], door.source);
    else if (Array.isArray(door.connects) && !door.connects.includes(door.roomId)) add(issues, "DOOR_ROOM_CONNECTION_MISMATCH", "error", path, `Door ${door.id} roomId is not one of its connected spaces.`, [door.id, door.roomId], door.source);
    if (!Number.isInteger(door.leafCount) || door.leafCount < 1 || door.leafCount > 2) add(issues, "DOOR_LEAF_COUNT_INVALID", "error", `${path}.leafCount`, "Door leafCount must be 1 or 2.", [door.id], door.source);
    if (!(finite(door.leafWidth) && door.leafWidth > 0)) add(issues, "DOOR_LEAF_WIDTH_INVALID", "error", `${path}.leafWidth`, "Door leaf width must be finite and positive.", [door.id], door.source);
    const leafWidths = Array.isArray(door.leafWidths)
      ? door.leafWidths
      : Array.from({ length: door.leafCount ?? 1 }, () => door.leafWidth);
    if (leafWidths.length !== door.leafCount || leafWidths.some((width) => !(finite(width) && width > 0))) add(issues, "DOOR_LEAF_WIDTHS_INVALID", "error", `${path}.leafWidths`, "Door leafWidths must contain one positive width per leaf.", [door.id], door.source);
    const requiredWidth = leafWidths.reduce((sum, width) => sum + (finite(width) ? width : 0), 0);
    if (finite(requiredWidth) && finite(door.width) && requiredWidth > door.width + 0.04 + options.epsilon) add(issues, "DOOR_LEAF_TOO_WIDE", "error", path, `Door leaves require ${requiredWidth.toFixed(3)} m inside a ${door.width.toFixed(3)} m opening.`, [door.id], door.source);
    if (!new Set(["start", "end", "outer"]).has(door.hinge)) add(issues, "DOOR_HINGE_INVALID", "error", `${path}.hinge`, `Unknown hinge value ${String(door.hinge)}.`, [door.id], door.source);
    if (door.hinge === "outer" && door.leafCount !== 2) add(issues, "DOOR_HINGE_LEAF_MISMATCH", "error", path, "The outer hinge mode is reserved for a two-leaf door.", [door.id], door.source);
    if (door.leafCount === 2 && door.hinge !== "outer") add(issues, "DOOR_HINGE_LEAF_MISMATCH", "error", path, "A two-leaf door must declare outer hinges.", [door.id], door.source);
    if (![1, -1].includes(door.swing)) add(issues, "DOOR_SWING_INVALID", "error", `${path}.swing`, "Door swing must be 1 or -1.", [door.id], door.source);
  });
}

function validateGlazingAndCurtains(issues, manifest, roomIds, wallById, deviceById) {
  const glazingById = new Map();
  (manifest.glazing ?? []).forEach((glazing, index) => {
    const path = `glazing[${index}]`;
    glazingById.set(glazing.id, glazing);
    const severity = glazing.confidence === "provisional" ? "warning" : "error";
    if (glazing.confidence === "provisional") add(issues, "PROVISIONAL_GLAZING", "warning", `${path}.confidence`, `${glazing.id} is an explicitly provisional panoramic-glazing reconstruction.`, [glazing.id], glazing.source);
    if (glazing.sections == null) add(issues, "GLAZING_SECTIONS_UNKNOWN", severity, `${path}.sections`, `${glazing.id} section layout is not confirmed.`, [glazing.id], glazing.source);
    else if (!Number.isInteger(glazing.sections) || glazing.sections <= 0) add(issues, "GLAZING_SECTIONS_INVALID", severity, `${path}.sections`, "Glazing sections must be a positive integer or null while provisional.", [glazing.id], glazing.source);
    if (glazing.frameWidth == null) add(issues, "GLAZING_FRAME_UNKNOWN", severity, `${path}.frameWidth`, `${glazing.id} frame width is not confirmed.`, [glazing.id], glazing.source);
    else if (!(finite(glazing.frameWidth) && glazing.frameWidth > 0)) add(issues, "GLAZING_FRAME_INVALID", severity, `${path}.frameWidth`, "Glazing frame width must be finite and positive.", [glazing.id], glazing.source);
    if (glazing.operable == null) add(issues, "GLAZING_OPERABILITY_UNKNOWN", severity, `${path}.operable`, `${glazing.id} opening configuration is not confirmed.`, [glazing.id], glazing.source);
    if (typeof glazing.glass !== "string" || glazing.glass.trim() === "") add(issues, "GLAZING_GLASS_UNSPECIFIED", severity, `${path}.glass`, `${glazing.id} has no glass description.`, [glazing.id], glazing.source);
    if (typeof glazing.profile !== "string" || glazing.profile.trim() === "") add(issues, "GLAZING_PROFILE_UNSPECIFIED", severity, `${path}.profile`, `${glazing.id} has no profile description.`, [glazing.id], glazing.source);
    for (const key of ["frameWidth", "frameDepth"]) {
      if (glazing[key] != null && (!(finite(glazing[key])) || glazing[key] <= 0)) add(issues, "GLAZING_FRAME_INVALID", severity, `${path}.${key}`, `${glazing.id} ${key} must be finite and positive.`, [glazing.id], glazing.source);
    }
    if (!wallById.has(glazing.wallId)) return;
    if (glazing.curtainDeviceId != null) {
      const device = deviceById.get(glazing.curtainDeviceId);
      if (!device || device.kind !== "curtain") add(issues, "GLAZING_CURTAIN_DEVICE_INVALID", "error", `${path}.curtainDeviceId`, `${glazing.id} references a missing or non-curtain device.`, [glazing.id, glazing.curtainDeviceId], glazing.source);
      else if (device.roomId !== glazing.roomId) add(issues, "DEVICE_ROOM_MISMATCH", "error", `${path}.curtainDeviceId`, `${glazing.id} and ${device.id} belong to different rooms.`, [glazing.id, device.id], glazing.source);
    }
  });

  (manifest.curtains ?? []).forEach((curtain, index) => {
    const path = `curtains[${index}]`;
    const glazing = glazingById.get(curtain.glazingId);
    const device = deviceById.get(curtain.deviceId);
    if (!roomIds.has(curtain.roomId)) add(issues, "ROOM_REF_UNKNOWN", "error", `${path}.roomId`, `Curtain ${curtain.id} references unknown room ${curtain.roomId}.`, [curtain.id, curtain.roomId], curtain.source);
    if (!glazing) add(issues, "CURTAIN_GLAZING_UNKNOWN", "error", `${path}.glazingId`, `Curtain ${curtain.id} references unknown glazing ${curtain.glazingId}.`, [curtain.id, curtain.glazingId], curtain.source);
    else if (glazing.roomId !== curtain.roomId) add(issues, "CURTAIN_ROOM_MISMATCH", "error", path, `${curtain.id} and ${glazing.id} belong to different rooms.`, [curtain.id, glazing.id], curtain.source);
    if (!device || device.kind !== "curtain") add(issues, "CURTAIN_DEVICE_INVALID", "error", `${path}.deviceId`, `${curtain.id} references a missing or non-curtain device.`, [curtain.id, curtain.deviceId], curtain.source);
    else if (device.roomId !== curtain.roomId) add(issues, "DEVICE_ROOM_MISMATCH", "error", path, `${curtain.id} and ${device.id} belong to different rooms.`, [curtain.id, device.id], curtain.source);
    if (![curtain.width, curtain.height, curtain.offsetFromGlass].every(finite) || !(curtain.width > 0) || !(curtain.height > 0) || curtain.offsetFromGlass < 0) add(issues, "CURTAIN_GEOMETRY_INVALID", "error", path, `Curtain ${curtain.id} contains invalid dimensions.`, [curtain.id], curtain.source);
    if (curtain.edgeClearance != null && (!(finite(curtain.edgeClearance)) || curtain.edgeClearance < 0 || curtain.edgeClearance * 2 >= curtain.width)) add(issues, "CURTAIN_EDGE_CLEARANCE_INVALID", "error", `${path}.edgeClearance`, `${curtain.id} has an invalid explicit reveal clearance.`, [curtain.id], curtain.source);
    if (glazing && Math.abs(curtain.width - glazing.width) > 0.05) add(issues, "CURTAIN_WIDTH_MISMATCH", "error", `${path}.width`, `${curtain.id} width differs from ${glazing.id} by more than 0.05 m.`, [curtain.id, glazing.id], curtain.source);
    if (glazing?.curtainDeviceId != null && glazing.curtainDeviceId !== curtain.deviceId) add(issues, "CURTAIN_GLAZING_DEVICE_MISMATCH", "error", path, `${curtain.id} is not linked to the curtain device declared by ${glazing.id}.`, [curtain.id, glazing.id], curtain.source);
  });
}

function validateUnplacedItems(issues, manifest, roomIds) {
  (manifest.unplacedItems ?? []).forEach((item, index) => {
    const path = `unplacedItems[${index}]`;
    validateConfidence(issues, item, path);
    validateSource(issues, item.source, `${path}.source`, item.id);
    if (!roomIds.has(item.roomId)) add(issues, "ROOM_REF_UNKNOWN", "error", `${path}.roomId`, `${item.id} references unknown room ${item.roomId}.`, [item.id, item.roomId], item.source);
    if (!isFiniteTuple(item.size, 3) || item.size.some((value) => !(value > 0))) add(issues, "UNPLACED_SIZE_INVALID", "error", `${path}.size`, `${item.id} must retain a finite positive documented size.`, [item.id], item.source);
    if (typeof item.reason !== "string" || item.reason.trim() === "") add(issues, "UNPLACED_REASON_MISSING", "error", `${path}.reason`, `${item.id} requires a concrete reason for omission from the scene.`, [item.id], item.source);
    if ("position" in item) add(issues, "UNPLACED_POSITION_FORBIDDEN", "error", `${path}.position`, `${item.id} is unplaced and must not carry a guessed position.`, [item.id], item.source);
  });
}

function validateFurniture(issues, manifest, roomById, materialIds, options) {
  (manifest.furniture ?? []).forEach((item, index) => {
    const path = `furniture[${index}]`;
    validateConfidence(issues, item, path);
    validateSource(issues, item.source, `${path}.source`, item.id);
    const room = roomById.get(item.roomId);
    if (!room) add(issues, "ROOM_REF_UNKNOWN", "error", `${path}.roomId`, `${item.id} references unknown room ${item.roomId}.`, [item.id, item.roomId], item.source);
    if (!isFiniteTuple(item.position, 3) || !isFiniteTuple(item.size, 3) || !item.size.every((value) => value > 0) || !finite(item.rotationY)) add(issues, "OBJECT_GEOMETRY_INVALID", "error", path, `${item.id} contains invalid position, size, or rotation.`, [item.id], item.source);
    if (!materialIds.has(item.materialId)) add(issues, "MATERIAL_REF_UNKNOWN", "error", `${path}.materialId`, `${item.id} references unknown material ${item.materialId}.`, [item.id, item.materialId], item.source);
    if (item.collider === false && (!Array.isArray(item.collisionParts) || item.collisionParts.length === 0)) add(issues, "COLLIDER_DISABLED_WITHOUT_PROXY", "error", `${path}.collider`, `${item.id} disables collision checks without supplying precise collisionParts.`, [item.id], item.source);
    const partIds = new Set();
    (item.collisionParts ?? []).forEach((part, partIndex) => {
      const partPath = `${path}.collisionParts[${partIndex}]`;
      if (typeof part.id !== "string" || part.id.trim() === "") add(issues, "COLLISION_PART_ID_INVALID", "error", `${partPath}.id`, "Collision part id must be a stable non-empty string.", [item.id], item.source);
      else if (partIds.has(part.id)) add(issues, "COLLISION_PART_ID_DUPLICATE", "error", `${partPath}.id`, `${item.id} repeats collision part id ${part.id}.`, [item.id, part.id], item.source);
      else partIds.add(part.id);
      if (!isFiniteTuple(part.offset, 3) || !isFiniteTuple(part.size, 3) || !part.size.every((value) => value > 0) || (part.rotationY != null && !finite(part.rotationY))) add(issues, "COLLISION_PART_GEOMETRY_INVALID", "error", partPath, `${item.id} collision part contains invalid offset, size, or rotation.`, [item.id, part.id].filter(Boolean), item.source);
    });
    if (!room || !isFiniteTuple(item.position, 3) || !isFiniteTuple(item.size, 3) || !finite(item.rotationY)) return;
    const colliders = buildFurnitureColliders(item);
    for (const collider of colliders) {
      if (!polygonContainsPolygon(room.polygon, obbFootprint(collider), options.epsilon)) add(issues, "OBJECT_OUTSIDE_ROOM", "error", path, `${item.id} footprint leaves room ${room.id}.`, [item.id, room.id], item.source);
      if (collider.center[1] - collider.half[1] < -options.epsilon || collider.center[1] + collider.half[1] > room.ceilingHeight + options.epsilon) add(issues, "OBJECT_VERTICAL_OUTSIDE_ROOM", "error", path, `${collider.id} exceeds the floor-to-ceiling volume of ${room.id}.`, [item.id, room.id], item.source);
    }
    if (item.position[1] < -options.epsilon || item.position[1] + item.size[1] > room.ceilingHeight + options.epsilon) add(issues, "OBJECT_VERTICAL_OUTSIDE_ROOM", "error", path, `${item.id} exceeds the floor-to-ceiling volume of ${room.id}.`, [item.id, room.id], item.source);
  });
}

function validateLights(issues, manifest, roomById, deviceById, options) {
  (manifest.lights ?? []).forEach((group, groupIndex) => {
    const path = `lights[${groupIndex}]`;
    validateConfidence(issues, group, path);
    validateSource(issues, group.source, `${path}.source`, group.id);
    const room = roomById.get(group.roomId);
    const device = deviceById.get(group.deviceId);
    if (!room) add(issues, "ROOM_REF_UNKNOWN", "error", `${path}.roomId`, `${group.id} references unknown room ${group.roomId}.`, [group.id, group.roomId], group.source);
    if (!device || device.kind !== "light") add(issues, "LIGHT_DEVICE_INVALID", "error", `${path}.deviceId`, `${group.id} references a missing or non-light device.`, [group.id, group.deviceId], group.source);
    else if (device.roomId !== group.roomId) add(issues, "DEVICE_ROOM_MISMATCH", "error", path, `${group.id} and ${device.id} belong to different rooms.`, [group.id, device.id], group.source);
    if (!(finite(group.height) && group.height > 0) || !(finite(group.maxIntensity) && group.maxIntensity > 0)) add(issues, "LIGHT_GROUP_NUMERIC_INVALID", "error", path, `${group.id} has invalid height or intensity.`, [group.id], group.source);
    if (typeof group.group !== "string" || group.group.trim() === "") add(issues, "LIGHT_CONTROL_GROUP_INVALID", "error", `${path}.group`, `${group.id} must declare a stable control group.`, [group.id], group.source);
    if (!Array.isArray(group.fixtures) || group.fixtures.length === 0) add(issues, "LIGHT_FIXTURES_EMPTY", "error", `${path}.fixtures`, `${group.id} has no visual fixtures.`, [group.id], group.source);
    (group.fixtures ?? []).forEach((fixture, fixtureIndex) => {
      const fixturePath = `${path}.fixtures[${fixtureIndex}]`;
      validateConfidence(issues, fixture, fixturePath);
      validateSource(issues, fixture.source, `${fixturePath}.source`, fixture.id);
      if (!isFiniteTuple(fixture.position, 3)) add(issues, "LIGHT_POSITION_INVALID", "error", `${fixturePath}.position`, `${fixture.id} has an invalid position.`, [fixture.id], fixture.source);
      else if (room) {
        const relation = classifyPointInPolygon([fixture.position[0], fixture.position[2]], room.polygon, options.epsilon);
        if (relation === "outside") add(issues, "LIGHT_OUTSIDE_ROOM", "error", fixturePath, `${fixture.id} lies outside room ${room.id}.`, [fixture.id, room.id], fixture.source);
        if (fixture.position[1] > room.ceilingHeight + options.epsilon || fixture.position[1] < -options.epsilon) add(issues, "LIGHT_VERTICAL_OUTSIDE_ROOM", "error", fixturePath, `${fixture.id} exceeds room ${room.id} vertical bounds.`, [fixture.id, room.id], fixture.source);
        if (finite(group.height) && Math.abs(fixture.position[1] - group.height) > options.epsilon) add(issues, "LIGHT_HEIGHT_MISMATCH", "error", fixturePath, `${fixture.id} height does not match its light group.`, [fixture.id, group.id], fixture.source);
      }
    });
  });
}

function validateDevices(issues, manifest, roomIds) {
  const lightsByDevice = new Map();
  const curtainsByDevice = new Map();
  for (const visual of manifest.lights ?? []) {
    const values = lightsByDevice.get(visual.deviceId) ?? [];
    values.push(visual);
    lightsByDevice.set(visual.deviceId, values);
  }
  for (const visual of manifest.curtains ?? []) {
    const values = curtainsByDevice.get(visual.deviceId) ?? [];
    values.push(visual);
    curtainsByDevice.set(visual.deviceId, values);
  }

  (manifest.devices ?? []).forEach((device, index) => {
    const path = `devices[${index}]`;
    validateConfidence(issues, device, path);
    validateSource(issues, device.source, `${path}.source`, device.id);
    if (!DEVICE_KINDS.has(device.kind)) add(issues, "DEVICE_KIND_INVALID", "error", `${path}.kind`, `Unknown device kind ${String(device.kind)}.`, [device.id], device.source);
    if (!roomIds.has(device.roomId)) add(issues, "ROOM_REF_UNKNOWN", "error", `${path}.roomId`, `${device.id} references unknown room ${device.roomId}.`, [device.id, device.roomId], device.source);
    if (!Array.isArray(device.capabilities) || device.capabilities.length === 0 || device.capabilities.some((item) => typeof item !== "string" || item === "")) add(issues, "DEVICE_CAPABILITIES_INVALID", "error", `${path}.capabilities`, `${device.id} has invalid capabilities.`, [device.id], device.source);
    if (!DEVICE_STATES.has(device.state)) add(issues, "DEVICE_STATE_INVALID", "error", `${path}.state`, `${device.id} has invalid state ${String(device.state)}.`, [device.id], device.source);
    if (device.binding !== null) add(issues, "DEVICE_BINDING_FORBIDDEN", "error", `${path}.binding`, `${device.id} must not contain a live binding in the design manifest.`, [device.id], device.source);
    if ("level" in device && (!(finite(device.level)) || device.level < 0 || device.level > 100)) add(issues, "DEVICE_LEVEL_INVALID", "error", `${path}.level`, `${device.id} level must be between 0 and 100.`, [device.id], device.source);
    const visuals = device.kind === "light" ? lightsByDevice.get(device.id) ?? [] : device.kind === "curtain" ? curtainsByDevice.get(device.id) ?? [] : [];
    if (["light", "curtain"].includes(device.kind) && visuals.length === 0) add(issues, "DEVICE_VISUAL_MISSING", "error", `${path}.visualId`, `${device.id} has no scene visual linked through deviceId.`, [device.id], device.source);
    if (["light", "curtain"].includes(device.kind) && visuals.length > 1) add(issues, "DEVICE_VISUAL_CARDINALITY_INVALID", "error", `${path}.visualId`, `${device.id} must link to exactly one grouped scene visual, not ${visuals.length}.`, [device.id, ...visuals.map((visual) => visual.id)], device.source);
    if (device.visualId != null && !visuals.some((visual) => visual.id === device.visualId)) add(issues, "DEVICE_VISUAL_LINK_BROKEN", "error", `${path}.visualId`, `${device.id} visualId ${device.visualId} does not identify one of its linked visuals.`, [device.id, device.visualId], device.source);
  });
}

function validateMaterials(issues, manifest) {
  (manifest.materials ?? []).forEach((material, index) => {
    const path = `materials[${index}]`;
    validateConfidence(issues, material, path);
    validateSource(issues, material.source, `${path}.source`, material.id);
    for (const key of ["roughness", "metalness", "transmission", "opacity"]) {
      if (key in material && (!(finite(material[key])) || material[key] < 0 || material[key] > 1)) add(issues, "MATERIAL_PROPERTY_INVALID", "error", `${path}.${key}`, `${material.id} ${key} must be between 0 and 1.`, [material.id], material.source);
    }
    if (material.kind === "glass") {
      if (!(finite(material.transmission) && material.transmission > 0)) add(issues, "GLASS_TRANSMISSION_INVALID", "error", `${path}.transmission`, `${material.id} must have positive transmission.`, [material.id], material.source);
      if (!(finite(material.ior) && material.ior > 1)) add(issues, "GLASS_IOR_INVALID", "error", `${path}.ior`, `${material.id} must have a physical IOR greater than 1.`, [material.id], material.source);
      if (!(finite(material.thickness) && material.thickness > 0)) add(issues, "GLASS_THICKNESS_INVALID", "error", `${path}.thickness`, `${material.id} must have positive thickness.`, [material.id], material.source);
    }
  });
}

function validateMaterialReferences(issues, manifest, materialIds) {
  (manifest.rooms ?? []).forEach((room, index) => {
    if (!materialIds.has(room.floorMaterial)) add(issues, "MATERIAL_REF_UNKNOWN", "error", `rooms[${index}].floorMaterial`, `${room.id} references unknown floor material ${String(room.floorMaterial)}.`, [room.id, room.floorMaterial].filter(Boolean), room.source);
  });
  for (const [collection, entities] of [["doors", manifest.doors ?? []], ["glazing", manifest.glazing ?? []], ["curtains", manifest.curtains ?? []]]) {
    entities.forEach((entity, index) => {
      for (const field of ["materialId", "glassMaterialId", "profileMaterialId"]) {
        if (entity[field] != null && !materialIds.has(entity[field])) add(issues, "MATERIAL_REF_UNKNOWN", "error", `${collection}[${index}].${field}`, `${entity.id} references unknown material ${entity[field]}.`, [entity.id, entity[field]], entity.source);
      }
    });
  }
}

function validateAllowedContacts(issues, manifest) {
  const knownIds = new Set(entityCollections(manifest).flatMap(([, entities]) => entities.map((entity) => entity?.id).filter(Boolean)));
  const declaredObjects = new Set();
  (manifest.allowedContacts ?? []).forEach((contact, index) => {
    const path = `allowedContacts[${index}]`;
    const hasKinds = Array.isArray(contact.kinds) && contact.kinds.length > 0 && contact.kinds.every((kind) => typeof kind === "string" && kind.length > 0);
    const hasObjects = Array.isArray(contact.objectIds) && contact.objectIds.length > 0;
    if (!hasKinds && !hasObjects) add(issues, "ALLOWED_CONTACT_SCOPE_INVALID", "error", path, `${contact.id} must declare kinds or objectIds.`, [contact.id]);
    for (const objectId of contact.objectIds ?? []) {
      declaredObjects.add(objectId);
      if (!knownIds.has(objectId)) add(issues, "ALLOWED_CONTACT_REF_UNKNOWN", "error", `${path}.objectIds`, `${contact.id} references unknown object ${objectId}.`, [contact.id, objectId]);
    }
    if (typeof contact.reason !== "string" || contact.reason.trim() === "") add(issues, "ALLOWED_CONTACT_REASON_MISSING", "error", `${path}.reason`, `${contact.id} must document why the contact is allowed.`, [contact.id]);
  });
  for (const [collection, entities] of [["furniture", manifest.furniture ?? []], ["curtains", manifest.curtains ?? []]]) {
    entities.forEach((item, index) => {
      for (const targetId of item.allowedContacts ?? []) {
        if (!knownIds.has(targetId)) add(issues, "ALLOWED_CONTACT_REF_UNKNOWN", "error", `${collection}[${index}].allowedContacts`, `${item.id} references unknown contact target ${targetId}.`, [item.id, targetId], item.source);
      }
      if ((item.allowedContacts ?? []).length > 0 && !declaredObjects.has(item.id)) add(issues, "ALLOWED_CONTACT_NOT_DECLARED", "error", `${collection}[${index}].allowedContacts`, `${item.id} uses contact allowances without a global declaration.`, [item.id], item.source);
    });
  }
}

function validateAreas(issues, manifest, options) {
  const rooms = manifest.rooms ?? [];
  let reportedTotal = 0;
  let computedTotal = 0;
  rooms.forEach((room, index) => {
    if (!(finite(room.reportedArea) && Array.isArray(room.polygon))) return;
    const computed = polygonArea(room.polygon);
    if (!finite(computed)) return;
    reportedTotal += room.reportedArea;
    computedTotal += computed;
    const tolerance = Math.max(options.perRoomAreaAbsoluteToleranceM2, room.reportedArea * options.perRoomAreaRelativeTolerance);
    const delta = Math.abs(computed - room.reportedArea);
    if (delta > tolerance + options.epsilon) add(issues, "ROOM_AREA_MISMATCH", room.confidence === "provisional" ? "warning" : "error", `rooms[${index}].reportedArea`, `${room.id} polygon area ${computed.toFixed(3)} m² differs from ${room.reportedArea.toFixed(3)} m² by ${delta.toFixed(3)} m² (tolerance ${tolerance.toFixed(3)}).`, [room.id], room.source);
  });
  if (finite(manifest.meta?.totalReportedArea)) {
    const sumDelta = Math.abs(reportedTotal - manifest.meta.totalReportedArea);
    if (sumDelta > options.totalAreaAbsoluteToleranceM2 + options.epsilon) add(issues, "EXPLICATION_SUM_MISMATCH", "error", "meta.totalReportedArea", `Room explication sum ${reportedTotal.toFixed(3)} m² differs from project total ${manifest.meta.totalReportedArea.toFixed(3)} m².`, rooms.map((room) => room.id));
    const tolerance = Math.max(options.totalAreaAbsoluteToleranceM2, manifest.meta.totalReportedArea * options.totalAreaRelativeTolerance);
    const computedDelta = Math.abs(computedTotal - manifest.meta.totalReportedArea);
    if (computedDelta > tolerance + options.epsilon) add(issues, "COMPUTED_AREA_TOTAL_MISMATCH", "error", "rooms", `Computed room polygons total ${computedTotal.toFixed(3)} m² differs from ${manifest.meta.totalReportedArea.toFixed(3)} m² by ${computedDelta.toFixed(3)} m².`, rooms.map((room) => room.id));
  }
  return { reportedTotal, computedTotal, deltaM2: Math.abs(computedTotal - reportedTotal) };
}

function validateScenarios(issues, manifest) {
  (manifest.scenarios ?? []).forEach((scenario, index) => {
    for (const key of ["lightLevel", "curtainLevel"]) {
      if (!(finite(scenario[key]) && scenario[key] >= 0 && scenario[key] <= 100)) add(issues, "SCENARIO_LEVEL_INVALID", "error", `scenarios[${index}].${key}`, `${scenario.id} ${key} must be between 0 and 100.`, [scenario.id]);
    }
    if (!(finite(scenario.climate) && scenario.climate >= 5 && scenario.climate <= 35)) add(issues, "SCENARIO_CLIMATE_INVALID", "error", `scenarios[${index}].climate`, `${scenario.id} climate setpoint is outside the safe demo range.`, [scenario.id]);
  });
}

export function validateManifest(manifest, overrides = {}) {
  const options = { ...VALIDATION_DEFAULTS, ...overrides };
  const issues = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    add(issues, "MANIFEST_INVALID", "error", "$", "Manifest must be a non-null object.");
    return { ok: false, errors: issues, warnings: [], issues, stats: { unresolvedCollisions: 0 } };
  }

  validateMeta(issues, manifest);
  validateIdentity(issues, manifest);
  validateSourceRegistry(issues, manifest);

  const roomById = new Map((manifest.rooms ?? []).map((room) => [room.id, room]));
  const roomIds = new Set(roomById.keys());
  const wallById = new Map((manifest.walls ?? []).map((wall) => [wall.id, wall]));
  const deviceById = new Map((manifest.devices ?? []).map((device) => [device.id, device]));
  const materialIds = new Set((manifest.materials ?? []).map((material) => material.id));

  validateShellAndRooms(issues, manifest, options);
  validateWalls(issues, manifest);
  validateOpenings(issues, manifest, roomIds, wallById, options);
  validateDoors(issues, manifest, roomIds, wallById, options);
  validateGlazingAndCurtains(issues, manifest, roomIds, wallById, deviceById);
  validateFurniture(issues, manifest, roomById, materialIds, options);
  validateUnplacedItems(issues, manifest, roomIds);
  validateLights(issues, manifest, roomById, deviceById, options);
  validateDevices(issues, manifest, roomIds);
  validateMaterials(issues, manifest);
  validateMaterialReferences(issues, manifest, materialIds);
  validateAllowedContacts(issues, manifest);
  validateScenarios(issues, manifest);
  const areaStats = validateAreas(issues, manifest, options);

  let collisionReport = { issues: [], unresolvedCollisions: 0, provisionalCollisionWarnings: 0, resolvedContacts: [], debug: {} };
  let collisionStages = [];
  try {
    collisionStages = validateCollisionStages(manifest, options);
    collisionReport = collisionStages.at(-1) ?? validateManifestCollisions(manifest, options);
    issues.push(...collisionReport.issues);
  } catch (error) {
    add(issues, "COLLISION_VALIDATOR_EXCEPTION", "error", "collisionValidator", `Collision validation failed closed: ${error instanceof Error ? error.message : String(error)}.`);
  }

  const uniqueIssues = [];
  const issueKeys = new Set();
  for (const item of issues) {
    const key = `${item.severity}:${item.code}:${item.path ?? ""}:${(item.entityIds ?? []).join("|")}:${item.message}`;
    if (!issueKeys.has(key)) {
      issueKeys.add(key);
      uniqueIssues.push(item);
    }
  }
  const errors = uniqueIssues.filter((item) => item.severity === "error");
  const warnings = uniqueIssues.filter((item) => item.severity === "warning");
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    issues: uniqueIssues,
    stats: {
      rooms: manifest.rooms?.length ?? 0,
      walls: manifest.walls?.length ?? 0,
      doors: manifest.doors?.length ?? 0,
      glazing: manifest.glazing?.length ?? 0,
      devices: manifest.devices?.length ?? 0,
      unresolvedCollisions: collisionReport.unresolvedCollisions,
      provisionalCollisionWarnings: collisionReport.provisionalCollisionWarnings,
      resolvedContacts: collisionReport.resolvedContacts.length,
      collisionStages: collisionStages.map((stage) => ({ id: stage.id, unresolvedCollisions: stage.unresolvedCollisions })),
      reportedAreaM2: areaStats.reportedTotal,
      computedAreaM2: areaStats.computedTotal,
      areaDeltaM2: areaStats.deltaM2,
    },
    debug: collisionReport.debug,
  };
}

export default validateManifest;
