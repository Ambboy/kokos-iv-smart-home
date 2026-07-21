import * as THREE from "three";
import { createTextSprite, pointAlongWall, polygonShape, roundedBox, wallFrame } from "./sceneUtils.js";

function collectWallOpenings(manifest, wallId) {
  return [
    ...manifest.doors.map((item) => ({ ...item, kind: "door", bottom: 0 })),
    ...manifest.glazing.map((item) => ({ ...item, kind: "glazing", bottom: item.sill })),
    ...manifest.openPassages.map((item) => ({ ...item, kind: "passage", bottom: 0 })),
  ]
    .filter((item) => item.wallId === wallId)
    .sort((a, b) => a.offset - b.offset);
}

function wallPiece(wall, startDistance, endDistance, bottom, height, material) {
  if (endDistance - startDistance <= 0.005 || height <= 0.005) return null;
  const frame = wallFrame(wall);
  const center = pointAlongWall(wall, (startDistance + endDistance) / 2, bottom + height / 2);
  const mesh = roundedBox(endDistance - startDistance, height, wall.thickness, material, 0);
  mesh.position.copy(center);
  mesh.rotation.y = frame.rotationY;
  mesh.name = `opaque-${wall.id}`;
  mesh.userData = { kind: "wall", wallId: wall.id, colliderId: wall.id };
  return mesh;
}

function buildWall(wall, manifest, material) {
  const group = new THREE.Group();
  group.name = wall.id;
  group.userData = {
    kind: "wall",
    wallId: wall.id,
    presentation: {
      start: [...wall.start],
      end: [...wall.end],
      thickness: wall.thickness,
    },
  };
  const { length } = wallFrame(wall);
  const openings = collectWallOpenings(manifest, wall.id);
  let cursor = 0;

  openings.forEach((opening) => {
    const start = Math.max(0, opening.offset);
    const end = Math.min(length, opening.offset + opening.width);
    const solid = wallPiece(wall, cursor, start, 0, wall.height, material);
    if (solid) group.add(solid);

    if (opening.bottom > 0) {
      const sill = wallPiece(wall, start, end, 0, opening.bottom, material);
      if (sill) group.add(sill);
    }
    const openingTop = opening.bottom + opening.height;
    if (openingTop < wall.height) {
      const header = wallPiece(wall, start, end, openingTop, wall.height - openingTop, material);
      if (header) group.add(header);
    }
    cursor = Math.max(cursor, end);
  });

  const tail = wallPiece(wall, cursor, length, 0, wall.height, material);
  if (tail) group.add(tail);
  return group;
}

export function buildArchitecture({ manifest, materials }) {
  const root = new THREE.Group();
  root.name = "architecture";
  const floors = new Map();
  const floorMeshes = [];
  const roomHighlights = new Map();
  const labels = new THREE.Group();
  labels.name = "room-labels";
  labels.visible = false;

  manifest.rooms.forEach((room) => {
    const baseMaterial = materials.get(room.floorMaterial) ?? materials.get("oak-edinburgh");
    const floorMaterial = baseMaterial.clone();
    floorMaterial.emissive = new THREE.Color("#9b7259");
    floorMaterial.emissiveIntensity = 0;
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(polygonShape(room.polygon)), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.012;
    floor.receiveShadow = true;
    floor.name = `floor-${room.id}`;
    floor.userData = { kind: "room", roomId: room.id };
    root.add(floor);
    floors.set(room.id, floor);
    floorMeshes.push(floor);

    const highlightGeometry = new THREE.ShapeGeometry(polygonShape(room.polygon));
    const highlight = new THREE.Group();
    highlight.name = `room-highlight-${room.id}`;
    highlight.rotation.x = -Math.PI / 2;
    highlight.position.y = 0.031;
    highlight.visible = false;
    highlight.userData = { kind: "room-highlight", roomId: room.id };

    const highlightFill = new THREE.Mesh(
      highlightGeometry,
      new THREE.MeshBasicMaterial({
        color: "#d7b870",
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        side: THREE.DoubleSide,
      }),
    );
    highlightFill.renderOrder = 4;
    highlightFill.name = `room-highlight-fill-${room.id}`;

    const highlightOutline = new THREE.LineSegments(
      new THREE.EdgesGeometry(highlightGeometry),
      new THREE.LineBasicMaterial({
        color: "#e6cf96",
        transparent: true,
        opacity: 0.82,
        depthTest: false,
      }),
    );
    highlightOutline.renderOrder = 5;
    highlightOutline.name = `room-highlight-outline-${room.id}`;
    highlight.add(highlightFill, highlightOutline);
    root.add(highlight);
    roomHighlights.set(room.id, highlight);

    const label = createTextSprite(`${room.number}  ${room.name}`);
    label.position.set(room.focus[0], 0.085, room.focus[2]);
    label.rotation.x = -Math.PI / 2;
    label.name = `label-${room.id}`;
    label.userData = { roomId: room.id };
    labels.add(label);
  });

  const slabMaterial = new THREE.MeshStandardMaterial({ color: "#232019", roughness: 0.92 });
  const slab = new THREE.Mesh(
    new THREE.ExtrudeGeometry(polygonShape(manifest.shell.exterior), { depth: 0.1, bevelEnabled: false }),
    slabMaterial,
  );
  slab.rotation.x = -Math.PI / 2;
  slab.position.y = -0.1;
  slab.receiveShadow = true;
  slab.name = "structural-slab";
  root.add(slab);

  const wallMaterial = materials.get("wall-warm-greige");
  const walls = new Map();
  manifest.walls.forEach((definition) => {
    const built = buildWall(definition, manifest, wallMaterial);
    root.add(built);
    walls.set(definition.id, built);
  });
  root.add(labels);

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.ExtrudeGeometry(polygonShape(manifest.shell.exterior), { depth: 0.03, bevelEnabled: false })),
    new THREE.LineBasicMaterial({ color: "#7a7468", transparent: true, opacity: 0.38 }),
  );
  outline.rotation.x = -Math.PI / 2;
  outline.position.y = -0.015;
  outline.name = "shell-outline";
  root.add(outline);

  const xs = manifest.shell.exterior.map(([x]) => x);
  const zs = manifest.shell.exterior.map(([, z]) => z);
  const presentation = {
    center: new THREE.Vector2(
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...zs) + Math.max(...zs)) / 2,
    ),
    span: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)),
  };

  return { root, floors, floorMeshes, roomHighlights, walls, labels, presentation };
}

export function updateRoomAppearance(architecture, selectedRoomId, climateDevices = []) {
  const climateByRoom = new Map(climateDevices.map((device) => [device.roomId, device]));
  architecture.floors.forEach((floor, roomId) => {
    const climate = climateByRoom.get(roomId);
    const heat = climate?.on ? THREE.MathUtils.clamp(((climate.level ?? 18) - 18) / 10, 0, 1) : 0;
    floor.material.emissive.set("#9b7259");
    floor.material.emissiveIntensity = heat * 0.055;
    const highlight = architecture.roomHighlights.get(roomId);
    if (highlight) highlight.visible = roomId === selectedRoomId;
  });
}

function orientation(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointOnSegment(a, b, point, epsilon = 1e-6) {
  return point[0] >= Math.min(a[0], b[0]) - epsilon
    && point[0] <= Math.max(a[0], b[0]) + epsilon
    && point[1] >= Math.min(a[1], b[1]) - epsilon
    && point[1] <= Math.max(a[1], b[1]) + epsilon;
}

function segmentIntersects(a, b, c, d) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  const epsilon = 1e-6;
  if (Math.abs(abC) <= epsilon && pointOnSegment(a, b, c, epsilon)) return true;
  if (Math.abs(abD) <= epsilon && pointOnSegment(a, b, d, epsilon)) return true;
  if (Math.abs(cdA) <= epsilon && pointOnSegment(c, d, a, epsilon)) return true;
  if (Math.abs(cdB) <= epsilon && pointOnSegment(c, d, b, epsilon)) return true;
  return (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0);
}

/**
 * Applies a camera-aware dollhouse cutaway without mutating wall geometry or
 * manifest data. Validation and debug/glazing views always keep the complete
 * architecture; only the presentation visibility of occluding wall groups is
 * changed.
 */
export function updateArchitecturePresentation(
  architecture,
  { camera, target, enabled = true, focusOccluders = false } = {},
) {
  if (!camera || !target) return;
  const cameraPoint = [camera.position.x, camera.position.z];
  const targetPoint = [target.x, target.z];
  const viewX = cameraPoint[0] - targetPoint[0];
  const viewZ = cameraPoint[1] - targetPoint[1];
  const viewLength = Math.hypot(viewX, viewZ) || 1;
  const view = [viewX / viewLength, viewZ / viewLength];
  const nearThreshold = architecture.presentation.span * 0.075;

  architecture.walls.forEach((wallGroup) => {
    if (!enabled) {
      wallGroup.visible = true;
      return;
    }

    const definition = wallGroup.userData.presentation;
    if (!definition) return;
    const midpoint = [
      (definition.start[0] + definition.end[0]) / 2,
      (definition.start[1] + definition.end[1]) / 2,
    ];
    const tangentX = definition.end[0] - definition.start[0];
    const tangentZ = definition.end[1] - definition.start[1];
    const tangentLength = Math.hypot(tangentX, tangentZ) || 1;
    const normalAlignment = Math.abs((tangentX / tangentLength) * view[1] - (tangentZ / tangentLength) * view[0]);
    const fromCenterX = midpoint[0] - architecture.presentation.center.x;
    const fromCenterZ = midpoint[1] - architecture.presentation.center.y;
    const nearSideDepth = fromCenterX * view[0] + fromCenterZ * view[1];
    const exteriorOccluder = definition.thickness >= 0.2
      && nearSideDepth > nearThreshold
      && normalAlignment > 0.24;
    const cameraRayOccluder = focusOccluders
      && segmentIntersects(cameraPoint, targetPoint, definition.start, definition.end)
      && Math.hypot(midpoint[0] - targetPoint[0], midpoint[1] - targetPoint[1]) > 0.55;

    wallGroup.visible = !(exteriorOccluder || cameraRayOccluder);
  });
}
