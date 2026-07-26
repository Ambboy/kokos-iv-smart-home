import * as THREE from "three";
import { createTextSprite, pointAlongWall, polygonShape, roundedBox, wallFrame } from "./sceneUtils.js";

export const DISPLAY_WALL_HEIGHT_SCALE = 1 / 3;

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

export function buildWall(wall, manifest, material, heightScale = DISPLAY_WALL_HEIGHT_SCALE) {
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
  const displayHeight = wall.height * heightScale;
  const openings = collectWallOpenings(manifest, wall.id);
  let cursor = 0;

  openings.forEach((opening) => {
    const start = Math.max(0, opening.offset);
    const end = Math.min(length, opening.offset + opening.width);
    const solid = wallPiece(wall, cursor, start, 0, displayHeight, material);
    if (solid) group.add(solid);

    if (opening.bottom > 0) {
      const sill = wallPiece(wall, start, end, 0, Math.min(opening.bottom, displayHeight), material);
      if (sill) group.add(sill);
    }
    const openingTop = opening.bottom + opening.height;
    if (openingTop < displayHeight) {
      const header = wallPiece(wall, start, end, openingTop, displayHeight - openingTop, material);
      if (header) group.add(header);
    }
    cursor = Math.max(cursor, end);
  });

  const tail = wallPiece(wall, cursor, length, 0, displayHeight, material);
  if (tail) group.add(tail);
  return group;
}

export function buildShadowWalls(manifest) {
  const root = new THREE.Group();
  root.name = "shadow-occlusion-walls";
  const shadowOnlyMaterial = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
  });

  manifest.walls.forEach((wall) => {
    const group = buildWall(wall, manifest, shadowOnlyMaterial, 1);
    group.name = `shadow-${wall.id}`;
    group.userData = {
      ...group.userData,
      kind: "shadow-wall",
      wallId: wall.id,
    };
    group.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = false;
      object.name = `shadow-${object.name}`;
      object.userData = { kind: "shadow-occluder", wallId: wall.id };
    });
    root.add(group);
  });

  return root;
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
  const shadowWalls = buildShadowWalls(manifest);
  root.add(shadowWalls, labels);

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

  return {
    root,
    floors,
    floorMeshes,
    roomHighlights,
    walls,
    shadowWalls,
    labels,
    presentation,
  };
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

/**
 * Shortened dollhouse walls stay visible from every orbit direction. Their
 * reduced height already preserves sight-lines, so camera-aware hiding would
 * expose the apartment to the exterior and make the shell appear unstable.
 */
export function updateArchitecturePresentation(architecture) {
  architecture?.walls?.forEach((wallGroup) => {
    wallGroup.visible = true;
  });
}
