import * as THREE from "three";
import { pointAlongWall, roundedBox, wallFrame, wallInteriorNormal } from "./sceneUtils.js";

const CURTAIN_EASING = 3.8;
const FABRIC_DEPTH = 0.045;

function initialDeviceLevel(device) {
  if (!device) return 0;
  return THREE.MathUtils.clamp((device.level ?? 100) / 100, 0, 1);
}

function materialFrom(materials, ...ids) {
  for (const id of ids) {
    const material = materials.get(id);
    if (material) return material;
  }
  return new THREE.MeshStandardMaterial({ color: "#aca397", roughness: 0.96 });
}

function placePanels(rig, openness) {
  const halfWidth = rig.width / 2;
  const closedStep = halfWidth / rig.halfCount;
  const openStep = Math.min(0.048, closedStep * 0.58);
  const openWidth = Math.min(rig.panelWidth, openStep * 0.72);
  const openScale = openWidth / rig.panelWidth;
  const edgeInset = Math.max(0.04, openWidth * 0.65);

  rig.leftPanels.forEach((panel, index) => {
    const closedX = -halfWidth + (index + 0.5) * closedStep;
    const openX = -halfWidth + edgeInset + index * openStep;
    panel.position.x = THREE.MathUtils.lerp(closedX, openX, openness);
    panel.scale.x = THREE.MathUtils.lerp(1, openScale, openness);
  });
  rig.rightPanels.forEach((panel, index) => {
    const closedX = halfWidth - (index + 0.5) * closedStep;
    const openX = halfWidth - edgeInset - index * openStep;
    panel.position.x = THREE.MathUtils.lerp(closedX, openX, openness);
    panel.scale.x = THREE.MathUtils.lerp(1, openScale, openness);
  });
}

function tagCurtainMesh(mesh, definition, glazing) {
  mesh.userData = {
    ...mesh.userData,
    kind: "curtain",
    curtainId: definition.id,
    deviceId: definition.deviceId,
    roomId: definition.roomId,
    glazingId: glazing.id,
  };
}

function createCurtainRig(definition, manifest, materials, device) {
  const glazing = manifest.glazing.find((item) => item.id === definition.glazingId);
  const wall = manifest.walls.find((item) => item.id === glazing.wallId);
  const room = manifest.rooms.find((item) => item.id === definition.roomId);
  const frame = wallFrame(wall);
  const normal = wallInteriorNormal(wall, room);
  const group = new THREE.Group();

  // The curtain is one layer on the room side. Separation includes the deepest
  // frame member, fabric half-depth and a 15 mm QA air gap.
  const frameHalfDepth = (glazing.frameDepth ?? Math.max(0.07, wall.thickness * 0.58)) / 2;
  const minimumSeparation = frameHalfDepth + FABRIC_DEPTH / 2 + 0.015;
  const separation = Math.max(definition.offsetFromGlass ?? 0.12, minimumSeparation);
  const center = pointAlongWall(wall, glazing.offset + glazing.width / 2, 0);
  center.x += normal.x * separation;
  center.z += normal.y * separation;
  group.position.copy(center);
  group.rotation.y = frame.rotationY;
  group.name = definition.id;
  group.userData = {
    kind: "curtain",
    curtainId: definition.id,
    deviceId: definition.deviceId,
    roomId: definition.roomId,
    glazingId: glazing.id,
    interiorSeparation: separation,
  };

  // The track follows the full opening; fabric stays inside the frame reveals.
  // edgeClearance is explicit manifest data so this is not a hidden QA shrink.
  const edgeClearance = THREE.MathUtils.clamp(definition.edgeClearance ?? 0, 0, glazing.width * 0.2);
  const width = glazing.width - edgeClearance * 2;
  const visualHeight = Math.min(definition.height, Math.max(0.25, room.ceilingHeight - 0.08));
  const railHeight = 0.035;
  const fabricHeight = Math.max(0.2, visualHeight - 0.085);
  const fabricMaterial = materialFrom(materials, "textile-warm", definition.materialId).clone();
  fabricMaterial.name = `fabric-${definition.id}`;
  fabricMaterial.side = THREE.DoubleSide;
  fabricMaterial.roughness = Math.max(0.88, fabricMaterial.roughness ?? 0.94);
  const railMaterial = materialFrom(materials, "bronze", "profile-black");

  const rail = roundedBox(width, railHeight, 0.048, railMaterial, 0.008);
  rail.position.y = visualHeight - railHeight / 2;
  rail.name = `rail-${definition.id}`;
  tagCurtainMesh(rail, definition, glazing);
  group.add(rail);

  const halfCount = THREE.MathUtils.clamp(Math.ceil(width / 0.46), 4, 16);
  const panelWidth = (width / (halfCount * 2)) * 0.94;
  const leftPanels = [];
  const rightPanels = [];
  for (let index = 0; index < halfCount; index += 1) {
    const createPanel = (side) => {
      const panel = roundedBox(panelWidth, fabricHeight, FABRIC_DEPTH, fabricMaterial, 0.018);
      panel.position.y = 0.025 + fabricHeight / 2;
      panel.name = `${definition.id}-${side}-${String(index + 1).padStart(2, "0")}`;
      panel.castShadow = true;
      panel.receiveShadow = false;
      tagCurtainMesh(panel, definition, glazing);
      group.add(panel);
      return panel;
    };
    leftPanels.push(createPanel("left"));
    rightPanels.push(createPanel("right"));
  }

  const hitTarget = new THREE.Mesh(
    new THREE.BoxGeometry(width, visualHeight, 0.018),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
  );
  hitTarget.position.y = visualHeight / 2;
  hitTarget.name = `hit-${definition.id}`;
  tagCurtainMesh(hitTarget, definition, glazing);
  group.add(hitTarget);

  const initial = initialDeviceLevel(device);
  const rig = {
    definition,
    glazing,
    wall,
    room,
    group,
    deviceId: definition.deviceId,
    width,
    visualHeight,
    separation,
    minimumSeparation,
    edgeClearance,
    fabricMaterial,
    rail,
    halfCount,
    panelWidth,
    leftPanels,
    rightPanels,
    hitTarget,
    current: initial,
    target: initial,
  };
  placePanels(rig, initial);
  return rig;
}

/** Builds curtains from the exact wall direction and glazing opening bounds. */
export function buildCurtains({ manifest, materials, devices = manifest.devices }) {
  const root = new THREE.Group();
  root.name = "curtains";
  const rigs = new Map();
  const hitTargets = [];
  const deviceById = new Map(devices.map((device) => [device.id, device]));

  manifest.curtains.forEach((definition) => {
    const glazing = manifest.glazing.find((item) => item.id === definition.glazingId);
    if (!glazing) throw new Error(`Curtain ${definition.id} references missing glazing ${definition.glazingId}`);
    const wall = manifest.walls.find((item) => item.id === glazing.wallId);
    if (!wall) throw new Error(`Curtain ${definition.id} references glazing without wall ${glazing.wallId}`);
    const room = manifest.rooms.find((item) => item.id === definition.roomId);
    if (!room) throw new Error(`Curtain ${definition.id} references missing room ${definition.roomId}`);

    const rig = createCurtainRig(definition, manifest, materials, deviceById.get(definition.deviceId));
    root.add(rig.group);
    rigs.set(definition.deviceId, rig);
    hitTargets.push(rig.hitTarget);
  });

  return { root, rigs, hitTargets };
}

/**
 * Animates normalized openness (0 = closed, 1 = open). Device levels are
 * optional so a caller may drive rig.target directly, including a stopped state.
 */
export function updateCurtains(curtains, deltaOrDevices = 1 / 60, optionsOrDelta = {}, legacyReducedMotion = false) {
  const legacyCall = Array.isArray(deltaOrDevices) || deltaOrDevices instanceof Map;
  const deltaSeconds = legacyCall
    ? (Number.isFinite(optionsOrDelta) ? optionsOrDelta : 1 / 60)
    : deltaOrDevices;
  const options = legacyCall
    ? { devices: deltaOrDevices, reducedMotion: legacyReducedMotion }
    : (optionsOrDelta ?? {});
  const {
    devices = undefined,
    reducedMotion = false,
  } = options;
  const rigs = curtains?.rigs ?? curtains;
  if (!(rigs instanceof Map)) return false;

  if (devices) {
    const deviceById = devices instanceof Map ? devices : new Map(devices.map((device) => [device.id, device]));
    rigs.forEach((rig, deviceId) => {
      const device = deviceById.get(deviceId);
      if (!device || device.state === "offline") return;
      rig.target = device.motion === "stopped" ? rig.current : initialDeviceLevel(device);
    });
  }

  const delta = THREE.MathUtils.clamp(Number.isFinite(deltaSeconds) ? deltaSeconds : 1 / 60, 0, 0.1);
  let animating = false;
  rigs.forEach((rig) => {
    const target = THREE.MathUtils.clamp(rig.target ?? 0, 0, 1);
    rig.current = reducedMotion ? target : THREE.MathUtils.damp(rig.current ?? 0, target, CURTAIN_EASING, delta);
    if (Math.abs(rig.current - target) < 0.001) rig.current = target;
    else animating = true;
    placePanels(rig, rig.current);
  });
  return animating;
}
