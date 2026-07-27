import * as THREE from "three";
import { roundedBox } from "./sceneUtils.js";

const LIGHT_COLOR = new THREE.Color("#ffd7a0");
const LIGHT_EASING = 8.5;
const PHYSICAL_LIGHT_SCALE = 18;
const POINT_FIXTURE_VISUAL_SCALE = 3;
const SUPPORTED_FIXTURE_KINDS = new Set([
  "downlight",
  "track",
  "pendant",
  "surface",
  "linear",
]);

function materialFrom(materials, ...ids) {
  for (const id of ids) {
    const material = materials.get(id);
    if (material) return material;
  }
  return new THREE.MeshStandardMaterial({ color: "#242625", roughness: 0.4, metalness: 0.35 });
}

function initialDeviceLevel(device) {
  if (!device || device.on === false) return 0;
  return THREE.MathUtils.clamp((device.level ?? 100) / 100, 0, 1);
}

function fixtureKind(definition, fixture) {
  const kind = fixture?.kind ?? definition.kind ?? "downlight";
  return SUPPORTED_FIXTURE_KINDS.has(kind) ? kind : "downlight";
}

function createRadialGlowTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = ((x + 0.5) / size) * 2 - 1;
      const dy = ((y + 0.5) / size) * 2 - 1;
      const radius = Math.hypot(dx, dy);
      const alpha = Math.round(255 * Math.max(0, 1 - radius) ** 2.25);
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 218;
      data[offset + 2] = 165;
      data[offset + 3] = alpha;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  texture.name = "light-zone-radial-glow";
  return texture;
}

function centroid(fixtures) {
  const total = fixtures.reduce(
    (sum, fixture) => sum.add(new THREE.Vector3(...fixture.position)),
    new THREE.Vector3(),
  );
  return total.multiplyScalar(1 / Math.max(fixtures.length, 1));
}

function clusterFixtures(fixtures) {
  if (fixtures.length <= 1) return fixtures.length ? [fixtures] : [];
  const clusterCount = THREE.MathUtils.clamp(Math.ceil(fixtures.length / 4), 1, 3);
  if (clusterCount === 1) return [fixtures];

  const xs = fixtures.map((fixture) => fixture.position[0]);
  const zs = fixtures.map((fixture) => fixture.position[2]);
  const axis = Math.max(...xs) - Math.min(...xs) >= Math.max(...zs) - Math.min(...zs) ? 0 : 2;
  const sorted = [...fixtures].sort((a, b) => a.position[axis] - b.position[axis]);
  return Array.from({ length: clusterCount }, (_, index) => (
    sorted.slice(
      Math.floor((index * sorted.length) / clusterCount),
      Math.floor(((index + 1) * sorted.length) / clusterCount),
    )
  )).filter((cluster) => cluster.length > 0);
}

function dominantClusterKind(definition, fixtures) {
  const counts = new Map();
  fixtures.forEach((fixture) => {
    const kind = fixtureKind(definition, fixture);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  });
  const fallback = fixtureKind(definition, null);
  return [...counts.entries()].sort((a, b) => {
    if (a[1] !== b[1]) return b[1] - a[1];
    if (a[0] === fallback) return -1;
    if (b[0] === fallback) return 1;
    return a[0].localeCompare(b[0]);
  })[0]?.[0] ?? fallback;
}

function distanceToSegment(x, z, [ax, az], [bx, bz]) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= Number.EPSILON) return Math.hypot(x - ax, z - az);
  const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / lengthSquared, 0, 1);
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

function distanceToRoomBoundary(room, center) {
  if (!room?.polygon?.length) return 0.5;
  return Math.min(...room.polygon.map((point, index) => (
    distanceToSegment(
      center.x,
      center.z,
      point,
      room.polygon[(index + 1) % room.polygon.length],
    )
  )));
}

function roomLightEnvelope(room, center, kind) {
  const desiredAngle = {
    track: Math.PI * 0.12,
    downlight: Math.PI * 0.2,
    surface: Math.PI * 0.24,
    linear: Math.PI * 0.27,
    pendant: Math.PI * 0.2,
  }[kind] ?? Math.PI * 0.2;
  const targetY = 0.05;
  const verticalReach = Math.max(0.2, center.y - 0.075 - targetY);
  const safeRadius = Math.max(0.04, distanceToRoomBoundary(room, center) - 0.06);
  const angle = Math.min(desiredAngle, Math.atan(safeRadius / verticalReach));
  return {
    angle,
    distance: Math.hypot(verticalReach, verticalReach * Math.tan(angle)) + 0.08,
    targetY,
  };
}

function tagDevice(root, deviceId, fixtureId = undefined) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.userData = {
      ...object.userData,
      kind: "light-fixture",
      deviceId,
      ...(fixtureId ? { fixtureId } : {}),
    };
  });
}

function addDownlight(parent, emitterMaterial, hardwareMaterial) {
  const housing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, 0.042, 20),
    hardwareMaterial,
  );
  const emitter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.053, 0.053, 0.008, 20),
    emitterMaterial,
  );
  emitter.position.y = -0.025;
  parent.add(housing, emitter);
}

function addTrackSpot(parent, emitterMaterial, hardwareMaterial) {
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 0.085, 12),
    hardwareMaterial,
  );
  stem.position.y = -0.037;
  const housing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.058, 0.072, 0.13, 18),
    hardwareMaterial,
  );
  housing.position.y = -0.142;
  const emitter = new THREE.Mesh(new THREE.CircleGeometry(0.049, 18), emitterMaterial);
  emitter.rotation.x = Math.PI / 2;
  emitter.position.y = -0.208;
  parent.add(stem, housing, emitter);
}

function addPendant(parent, room, fixtureY, emitterMaterial, hardwareMaterial) {
  const ceilingHeight = room?.ceilingHeight ?? fixtureY + 0.55;
  const cableLength = Math.max(0.18, ceilingHeight - fixtureY - 0.07);
  const cable = new THREE.Mesh(
    new THREE.CylinderGeometry(0.007, 0.007, cableLength, 8),
    hardwareMaterial,
  );
  cable.position.y = cableLength / 2 + 0.07;
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.135, 0.16, 24, 1, true),
    hardwareMaterial,
  );
  shade.position.y = 0.012;
  const emitter = new THREE.Mesh(new THREE.SphereGeometry(0.046, 16, 12), emitterMaterial);
  emitter.position.y = -0.082;
  parent.add(cable, shade, emitter);
}

function addSurface(parent, fixture, emitterMaterial, hardwareMaterial) {
  const size = fixture.size ?? [0.28, 0.05, 0.28];
  const radius = THREE.MathUtils.clamp(Math.max(size[0], size[2]) / 2, 0.09, 0.25);
  const height = THREE.MathUtils.clamp(size[1] ?? 0.05, 0.035, 0.075);
  const housing = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 28),
    hardwareMaterial,
  );
  housing.position.y = -height / 2;
  const emitter = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.82, radius * 0.82, 0.009, 28),
    emitterMaterial,
  );
  emitter.position.y = -height - 0.004;
  parent.add(housing, emitter);
}

function addLinear(parent, fixture, emitterMaterial, hardwareMaterial) {
  const length = THREE.MathUtils.clamp(
    fixture.length ?? fixture.size?.[0] ?? 0.8,
    0.22,
    6,
  );
  const profile = roundedBox(length, 0.026, 0.04, hardwareMaterial, 0.005);
  profile.position.y = -0.012;
  const emitter = roundedBox(Math.max(0.08, length - 0.03), 0.007, 0.021, emitterMaterial, 0.004);
  emitter.position.y = -0.029;
  parent.add(profile, emitter);
}

function addFixtureVisual(definition, fixture, room, emitterMaterial, hardwareMaterial) {
  const kind = fixtureKind(definition, fixture);
  const fixtureGroup = new THREE.Group();
  fixtureGroup.name = fixture.id;
  fixtureGroup.position.set(...fixture.position);
  fixtureGroup.rotation.y = fixture.rotationY ?? 0;
  fixtureGroup.userData = {
    kind: "light-fixture",
    fixtureKind: kind,
    fixtureId: fixture.id,
    deviceId: definition.deviceId,
    roomId: definition.roomId,
  };

  const detail = new THREE.Group();
  if (kind === "pendant") addPendant(detail, room, fixture.position[1], emitterMaterial, hardwareMaterial);
  else if (kind === "track") addTrackSpot(detail, emitterMaterial, hardwareMaterial);
  else if (kind === "surface") addSurface(detail, fixture, emitterMaterial, hardwareMaterial);
  else if (kind === "linear") addLinear(detail, fixture, emitterMaterial, hardwareMaterial);
  else addDownlight(detail, emitterMaterial, hardwareMaterial);

  if (kind === "downlight" || kind === "track" || kind === "surface") {
    detail.scale.setScalar(POINT_FIXTURE_VISUAL_SCALE);
  }
  fixtureGroup.add(detail);

  tagDevice(fixtureGroup, definition.deviceId, fixture.id);
  return fixtureGroup;
}

function railPoint(point, fallbackY) {
  if (!Array.isArray(point) || point.length < 2) return null;
  if (point.length >= 3) return new THREE.Vector3(point[0], point[1], point[2]);
  return new THREE.Vector3(point[0], fallbackY, point[1]);
}

function fallbackTrackRails(definition) {
  const fixtures = definition.fixtures.filter((fixture) => fixtureKind(definition, fixture) === "track");
  if (fixtures.length < 2) return [];
  const origin = new THREE.Vector2(fixtures[0].position[0], fixtures[0].position[2]);
  let furthest = origin.clone();
  let furthestDistance = 0;
  fixtures.forEach((fixture) => {
    const point = new THREE.Vector2(fixture.position[0], fixture.position[2]);
    const distance = point.distanceToSquared(origin);
    if (distance > furthestDistance) {
      furthest.copy(point);
      furthestDistance = distance;
    }
  });
  if (furthestDistance < 0.0025) return [];

  const direction = furthest.sub(origin).normalize();
  const normal = new THREE.Vector2(-direction.y, direction.x);
  const projections = fixtures.map((fixture) => {
    const point = new THREE.Vector2(fixture.position[0], fixture.position[2]);
    const delta = point.sub(origin);
    return {
      along: delta.dot(direction),
      across: Math.abs(delta.dot(normal)),
    };
  });
  if (projections.some(({ across }) => across > 0.035)) return [];

  const min = Math.min(...projections.map(({ along }) => along));
  const max = Math.max(...projections.map(({ along }) => along));
  const start = origin.clone().addScaledVector(direction, min);
  const end = origin.clone().addScaledVector(direction, max);
  return [{ start: [start.x, start.y], end: [end.x, end.y] }];
}

function addTrackRails(group, definition, hardwareMaterial) {
  const explicitRails = Array.isArray(definition.rails) && definition.rails.length > 0
    ? definition.rails
    : null;
  const rails = explicitRails ?? fallbackTrackRails(definition);
  const fallbackY = definition.height ?? definition.fixtures[0]?.position?.[1] ?? 3;

  rails.forEach((railDefinition, index) => {
    const start = railPoint(railDefinition.start, fallbackY);
    const end = railPoint(railDefinition.end, fallbackY);
    if (!start || !end) return;
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.05) return;
    const rail = roundedBox(length + 0.08, 0.03, 0.038, hardwareMaterial, 0.006);
    rail.position.set(
      (start.x + end.x) / 2,
      (start.y + end.y) / 2 + 0.022,
      (start.z + end.z) / 2,
    );
    rail.rotation.y = -Math.atan2(dz, dx);
    rail.name = `rail-${definition.id}-${String(index + 1).padStart(2, "0")}`;
    rail.userData = {
      kind: "light-fixture",
      deviceId: definition.deviceId,
      fixtureId: `${definition.id}-rail-${index + 1}`,
    };
    group.add(rail);
  });
}

function createHitTarget(definition, fixture) {
  const kind = fixtureKind(definition, fixture);
  const radius = kind === "pendant" || kind === "surface" ? 0.28 : kind === "linear" ? 0.22 : 0.24;
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 8, 6),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false,
    }),
  );
  hit.position.set(...fixture.position);
  hit.name = `hit-${fixture.id}`;
  hit.userData = {
    kind: "light-fixture",
    fixtureKind: kind,
    deviceId: definition.deviceId,
    fixtureId: fixture.id,
  };
  return hit;
}

function createActualLight(definition, room, center, kind, sourceIndex, castShadow) {
  const envelope = roomLightEnvelope(room, center, kind);
  const light = new THREE.SpotLight(
    LIGHT_COLOR,
    0,
    envelope.distance,
    envelope.angle,
    kind === "track" ? 0.48 : kind === "pendant" ? 0.78 : 0.68,
    1.8,
  );
  light.position.set(center.x, center.y - 0.075, center.z);
  light.name = `source-${definition.id}-${sourceIndex + 1}`;
  light.castShadow = castShadow;
  if (castShadow) {
    light.shadow.mapSize.set(512, 512);
    light.shadow.camera.near = 0.2;
    light.shadow.camera.far = envelope.distance;
    light.shadow.bias = -0.00025;
    light.shadow.normalBias = 0.018;
  }
  const target = new THREE.Object3D();
  target.position.set(center.x, envelope.targetY, center.z);
  target.name = `target-${definition.id}-${sourceIndex + 1}`;
  light.target = target;
  return { light, target };
}

function createZoneGlow(definition, fixture, sourceIndex, glowTexture, room) {
  const kind = fixtureKind(definition, fixture);
  const center = new THREE.Vector3(...fixture.position);
  const safeRadius = Math.max(0.015, distanceToRoomBoundary(room, center) - 0.03);
  const material = new THREE.MeshBasicMaterial({
    map: glowTexture,
    color: LIGHT_COLOR,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const radiusByKind = { track: 0.8, downlight: 0.72, surface: 0.88, pendant: 1.0 };
  const geometry = kind === "linear"
    ? new THREE.PlaneGeometry(
      THREE.MathUtils.clamp(fixture.length ?? 0.8, 0.22, 5.5),
      Math.min(0.54, safeRadius * 2),
    )
    : new THREE.CircleGeometry(Math.min(radiusByKind[kind] ?? 0.58, safeRadius), 32);
  const zone = new THREE.Mesh(geometry, material);
  zone.rotation.order = "YXZ";
  zone.rotation.y = fixture.rotationY ?? 0;
  zone.rotation.x = -Math.PI / 2;
  zone.position.set(center.x, 0.065, center.z);
  zone.renderOrder = 2;
  zone.name = `zone-${definition.id}-${sourceIndex + 1}`;
  zone.userData = {
    kind: "light-zone",
    fixtureKind: kind,
    deviceId: definition.deviceId,
    roomId: definition.roomId,
    maxOpacity: kind === "linear" ? 0.28 : kind === "pendant" ? 0.45 : kind === "surface" ? 0.4 : 0.42,
  };
  return zone;
}

function createLightRig(definition, manifest, materials, device, glowTexture, shadowBudget) {
  const room = manifest.rooms.find((item) => item.id === definition.roomId);
  const group = new THREE.Group();
  group.name = definition.id;
  group.userData = {
    kind: "light-group",
    deviceId: definition.deviceId,
    roomId: definition.roomId,
    lightId: definition.id,
  };

  const usesDarkProfile = definition.fixtures.some((fixture) => {
    const kind = fixtureKind(definition, fixture);
    return kind === "track" || kind === "linear";
  });
  const hardwareMaterial = materialFrom(
    materials,
    usesDarkProfile ? "profile-black" : "bronze",
    "profile-black",
  );
  const emitterMaterial = materialFrom(materials, "sanitary-white", "ceiling-matte").clone();
  emitterMaterial.name = `emitter-${definition.id}`;
  emitterMaterial.color.set("#665b4d");
  emitterMaterial.emissive = LIGHT_COLOR.clone();
  emitterMaterial.emissiveIntensity = 0;

  const hitTargets = [];
  const glowMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    color: LIGHT_COLOR,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  definition.fixtures.forEach((fixture) => {
    group.add(addFixtureVisual(definition, fixture, room, emitterMaterial, hardwareMaterial));
    const hit = createHitTarget(definition, fixture);
    hitTargets.push(hit);
    group.add(hit);

    const kind = fixtureKind(definition, fixture);
    const glow = new THREE.Sprite(glowMaterial);
    const glowScale = kind === "pendant" ? 0.85 : kind === "linear" ? 0.58 : 0.48;
    glow.scale.set(glowScale, glowScale, 1);
    glow.position.set(fixture.position[0], fixture.position[1] + 0.04, fixture.position[2]);
    glow.name = `glow-${fixture.id}`;
    group.add(glow);
  });
  addTrackRails(group, definition, hardwareMaterial);

  const clusters = clusterFixtures(definition.fixtures);
  const lights = [];
  const targets = [];
  const zones = [];
  const lightWeights = [];
  const averageClusterSize = definition.fixtures.length / Math.max(clusters.length, 1);
  clusters.forEach((fixtures, index) => {
    const center = centroid(fixtures);
    const kind = dominantClusterKind(definition, fixtures);
    const castShadow = kind === "track" && index === 0 && shadowBudget.remaining > 0;
    if (castShadow) shadowBudget.remaining -= 1;
    const source = createActualLight(definition, room, center, kind, index, castShadow);
    lights.push(source.light);
    group.add(source.light);
    if (source.target) {
      targets.push(source.target);
      group.add(source.target);
    }
    lightWeights.push(THREE.MathUtils.clamp(fixtures.length / averageClusterSize, 0.72, 1.16));
  });

  definition.fixtures.forEach((fixture, index) => {
    const zone = createZoneGlow(definition, fixture, index, glowTexture, room);
    zones.push(zone);
    group.add(zone);
  });

  const initial = initialDeviceLevel(device);
  return {
    definition,
    deviceId: definition.deviceId,
    group,
    lights,
    targets,
    zones,
    glowMaterial,
    materials: [emitterMaterial],
    lightWeights,
    hitTargets,
    maxIntensity: definition.maxIntensity,
    current: initial,
    target: initial,
  };
}

/** Builds exact fixture visuals and 1–3 clustered real lights per control group. */
export function buildLights({ manifest, materials, devices = manifest.devices }) {
  const root = new THREE.Group();
  root.name = "lights";
  const rigs = new Map();
  const hitTargets = [];
  const deviceById = new Map(devices.map((device) => [device.id, device]));
  const glowTexture = createRadialGlowTexture();
  const shadowBudget = { remaining: 2 };

  manifest.lights.forEach((definition) => {
    const rig = createLightRig(
      definition,
      manifest,
      materials,
      deviceById.get(definition.deviceId),
      glowTexture,
      shadowBudget,
    );
    root.add(rig.group);
    rigs.set(definition.deviceId, rig);
    hitTargets.push(...rig.hitTargets);
  });

  const built = { root, rigs, hitTargets };
  updateLights(built, 0, { reducedMotion: true });
  return built;
}

/**
 * Advances physical and visual light state. Device levels are optional: callers
 * may instead assign rig.target directly. Levels/current/target are normalized.
 */
export function updateLights(
  lighting,
  deltaOrDevices = 1 / 60,
  optionsOrDelta = {},
  legacyReducedMotion = false,
) {
  const legacyCall = Array.isArray(deltaOrDevices) || deltaOrDevices instanceof Map;
  const deltaSeconds = legacyCall
    ? (Number.isFinite(optionsOrDelta) ? optionsOrDelta : 1 / 60)
    : deltaOrDevices;
  const options = legacyCall
    ? { devices: deltaOrDevices, reducedMotion: legacyReducedMotion }
    : (optionsOrDelta ?? {});
  const {
    devices = undefined,
    sceneFactor = 1,
    lightColor = LIGHT_COLOR,
    reducedMotion = false,
  } = options;
  const rigs = lighting?.rigs ?? lighting;
  if (!(rigs instanceof Map)) return false;
  const activeLightColor = lightColor?.isColor ? lightColor : new THREE.Color(lightColor);

  if (devices) {
    const deviceById = devices instanceof Map
      ? devices
      : new Map(devices.map((device) => [device.id, device]));
    rigs.forEach((rig, deviceId) => {
      const device = deviceById.get(deviceId);
      if (device && device.state !== "offline") rig.target = initialDeviceLevel(device);
    });
  }

  const delta = THREE.MathUtils.clamp(
    Number.isFinite(deltaSeconds) ? deltaSeconds : 1 / 60,
    0,
    0.1,
  );
  let animating = false;
  rigs.forEach((rig) => {
    const target = THREE.MathUtils.clamp(rig.target ?? 0, 0, 1);
    rig.current = reducedMotion
      ? target
      : THREE.MathUtils.damp(rig.current ?? 0, target, LIGHT_EASING, delta);
    if (Math.abs(rig.current - target) < 0.001) rig.current = target;
    else animating = true;

    const level = THREE.MathUtils.clamp(rig.current, 0, 1);
    const factor = Math.max(0, sceneFactor);
    rig.lights.forEach((light, index) => {
      light.color.copy(activeLightColor);
      light.intensity = rig.maxIntensity * PHYSICAL_LIGHT_SCALE * (rig.lightWeights[index] ?? 1) * level * factor;
    });
    rig.materials.forEach((material) => {
      material.emissive.copy(activeLightColor);
      material.emissiveIntensity = level * (3.2 + 4 * Math.min(factor, 1.25));
      material.color.copy(activeLightColor).multiplyScalar(THREE.MathUtils.lerp(0.24, 0.9, level));
    });
    if (rig.glowMaterial) {
      rig.glowMaterial.color.copy(activeLightColor);
      rig.glowMaterial.opacity = level * (0.26 + 0.3 * Math.min(factor, 1.2));
    }
    rig.zones.forEach((zone) => {
      zone.material.color.copy(activeLightColor);
      zone.material.opacity = level * (zone.userData.maxOpacity ?? 0.15) * factor;
      zone.visible = level > 0.001 && factor > 0.001;
    });
  });
  return animating;
}
