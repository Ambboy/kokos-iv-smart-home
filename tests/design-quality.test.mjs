import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import projectManifest from "../src/data/project-manifest-v2.js";
import {
  buildShadowWalls,
  buildWall,
  updateArchitecturePresentation,
} from "../src/scene/buildArchitecture.js";
import { buildDoors } from "../src/scene/buildDoors.js";
import { buildLights, updateLights } from "../src/scene/buildLights.js";
import { devicesForScenario, scenarioLightPalette } from "../src/scene/sceneScenario.js";
import { createMaterialRegistry } from "../src/scene/sceneUtils.js";

let cachedProjectLighting;
function buildProjectLighting() {
  cachedProjectLighting ??= buildLights({
    manifest: projectManifest,
    materials: createMaterialRegistry(projectManifest),
  });
  return cachedProjectLighting;
}

function buildProjectArchitecture() {
  const material = new THREE.MeshStandardMaterial();
  const walls = new Map(projectManifest.walls.map((wall) => [
    wall.id,
    buildWall(wall, projectManifest, material),
  ]));
  const xs = projectManifest.shell.exterior.map(([x]) => x);
  const zs = projectManifest.shell.exterior.map(([, z]) => z);
  return {
    walls,
    presentation: {
      center: new THREE.Vector2(
        (Math.min(...xs) + Math.max(...xs)) / 2,
        (Math.min(...zs) + Math.max(...zs)) / 2,
      ),
      span: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)),
    },
  };
}

function furnitureById(id) {
  const item = projectManifest.furniture.find((definition) => definition.id === id);
  assert.ok(item, id);
  return item;
}

function worldPoint(definition, localX, localZ) {
  const cosine = Math.cos(definition.rotationY);
  const sine = Math.sin(definition.rotationY);
  return [
    definition.position[0] + localX * cosine + localZ * sine,
    definition.position[2] - localX * sine + localZ * cosine,
  ];
}

function distanceToWall(point, wallId) {
  const wall = projectManifest.walls.find(({ id }) => id === wallId);
  assert.ok(wall, wallId);
  const [px, pz] = point;
  const [ax, az] = wall.start;
  const [bx, bz] = wall.end;
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSquared));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t)) - wall.thickness / 2;
}

function assertBackAgainstWall(id, wallId, frontAxis = "cabinet") {
  const item = furnitureById(id);
  const localZ = frontAxis === "bed" ? -item.size[2] / 2 : -item.size[2] / 2;
  const contact = worldPoint(item, 0, localZ);
  assert.ok(Math.abs(distanceToWall(contact, wallId)) <= 0.03, `${id} is not against ${wallId}`);
}

function assertCabinetOpensAwayFromWall(id, wallId) {
  const item = furnitureById(id);
  const back = worldPoint(item, 0, -item.size[2] / 2);
  const front = worldPoint(item, 0, item.size[2] / 2);
  assert.ok(Math.abs(distanceToWall(back, wallId)) <= 0.03, `${id} back misses ${wallId}`);
  assert.ok(distanceToWall(front, wallId) > item.size[2] * 0.8, `${id} doors face ${wallId}`);
}

test("bed headboards touch solid walls", () => {
  assertBackAgainstWall("master-bed-main", "wall-left-west", "bed");
  assertBackAgainstWall("guest-bed-main", "wall-left-west", "bed");
});

test("kitchen keeps a comfortable working aisle between run and island", () => {
  const run = furnitureById("kitchen-run");
  const island = furnitureById("kitchen-island");
  const runFront = worldPoint(run, 0, run.size[2] / 2);
  const islandSouthEdge = island.position[2] + island.size[2] / 2;
  assert.ok(runFront[1] - islandSouthEdge >= 0.9);
});

test("built-in cabinet fronts open into their rooms", () => {
  assertCabinetOpensAwayFromWall("wardrobe-system", "wall-wardrobe-south");
  assertCabinetOpensAwayFromWall("guest-cabinet", "wall-left-south");
  assertCabinetOpensAwayFromWall("laundry-cabinet", "wall-laundry-west");
  assertCabinetOpensAwayFromWall("kitchen-run", "wall-right-south");
});

test("exterior entry door closes its opening in presentation mode", () => {
  const entry = projectManifest.doors.find(({ id }) => id === "door-entry");
  assert.equal(entry?.presentationAngle, 0);
  const doors = buildDoors({
    manifest: projectManifest,
    materials: createMaterialRegistry(projectManifest),
  });
  const leaves = [];
  doors.doors.get("door-entry").group.traverse((object) => {
    if (object.userData.kind === "door-leaf") leaves.push(object);
  });
  assert.equal(leaves.length, 2);
  leaves.forEach((leaf) => assert.ok(Math.abs(leaf.parent.rotation.y) < 1e-9));
});

test("exterior walls never contain unfilled open passages", () => {
  const exteriorWallIds = new Set([
    "wall-left-north",
    "wall-left-west",
    "wall-left-south",
    "wall-right-north",
    "wall-right-east",
    "wall-right-south",
    "wall-entry-east",
    "wall-entry-south",
  ]);
  assert.deepEqual(
    projectManifest.openPassages.filter(({ wallId }) => exteriorWallIds.has(wallId)),
    [],
  );
});

test("dining pendant stays centered over the dining table", () => {
  const table = furnitureById("dining-table");
  const pendant = projectManifest.lights.find(({ id }) => id === "light-dining-pendant");
  assert.ok(pendant?.fixtures?.length === 1);
  assert.ok(Math.hypot(
    pendant.fixtures[0].position[0] - table.position[0],
    pendant.fixtures[0].position[2] - table.position[2],
  ) <= 0.05);
});

function distanceToPolygonBoundary(x, z, polygon) {
  return Math.min(...polygon.map(([ax, az], index) => {
    const [bx, bz] = polygon[(index + 1) % polygon.length];
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSquared = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSquared));
    return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
  }));
}

function pointInPolygon(x, z, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const [xi, zi] = polygon[index];
    const [xj, zj] = polygon[previous];
    const crosses = ((zi > z) !== (zj > z))
      && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

test("evening scenario layers decorative and task lighting", () => {
  const eveningLights = devicesForScenario(projectManifest, "evening")
    .filter(({ kind }) => kind === "light");
  const levels = new Map(eveningLights.map(({ id, level }) => [id, level]));
  assert.equal(levels.get("device-light-dining"), 72);
  assert.equal(levels.get("device-light-track"), 42);
  assert.equal(levels.get("device-light-living"), 28);
  assert.equal(levels.get("device-light-master-bath"), 12);
  assert.ok(new Set(levels.values()).size >= 5);
});

test("day and evening use distinctly different light color palettes", () => {
  const day = scenarioLightPalette("day");
  const evening = scenarioLightPalette("evening");
  const dayFixture = new THREE.Color(day.fixtureColor);
  const eveningFixture = new THREE.Color(evening.fixtureColor);
  const dayWarmth = dayFixture.r - dayFixture.b;
  const eveningWarmth = eveningFixture.r - eveningFixture.b;

  assert.ok(eveningWarmth >= dayWarmth + 0.25);
  assert.notEqual(day.background, evening.background);
  assert.ok(
    evening.sceneLightFactor / evening.environmentIntensity
      >= (day.sceneLightFactor / day.environmentIntensity) * 3,
  );
});

test("scenario fixture color reaches physical lights and visible emitters", () => {
  const lighting = buildProjectLighting();
  const evening = scenarioLightPalette("evening");
  updateLights(lighting, 0, {
    reducedMotion: true,
    sceneFactor: evening.sceneLightFactor,
    lightColor: evening.fixtureColor,
  });
  const expected = new THREE.Color(evening.fixtureColor);
  lighting.rigs.forEach((rig) => {
    rig.lights.forEach((light) => assert.ok(light.color.equals(expected)));
    rig.materials.forEach((material) => assert.ok(material.emissive.equals(expected)));
    assert.ok(rig.glowMaterial.color.equals(expected));
    rig.zones.forEach((zone) => assert.ok(zone.material.color.equals(expected)));
  });
});

test("decorative floor glows stay inside their assigned rooms", () => {
  const lighting = buildProjectLighting();
  lighting.root.updateMatrixWorld(true);
  lighting.rigs.forEach((rig) => {
    const room = projectManifest.rooms.find(({ id }) => id === rig.definition.roomId);
    rig.zones.forEach((zone) => {
      const positions = zone.geometry.getAttribute("position");
      for (let index = 0; index < positions.count; index += 1) {
        const world = new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(zone.matrixWorld);
        assert.equal(pointInPolygon(world.x, world.z, room.polygon), true, zone.name);
      }
    });
  });
});

test("physical fixture lights stay inside their room boundaries", () => {
  const lighting = buildProjectLighting();
  lighting.rigs.forEach((rig) => {
    const room = projectManifest.rooms.find(({ id }) => id === rig.definition.roomId);
    rig.lights.forEach((light) => {
      assert.equal(light.isSpotLight, true, light.name);
      const targetY = light.target.position.y;
      const floorRadius = Math.max(0, light.position.y - targetY) * Math.tan(light.angle);
      const boundary = distanceToPolygonBoundary(light.position.x, light.position.z, room.polygon);
      assert.ok(floorRadius <= boundary - 0.04 + 1e-6, `${light.name}: ${floorRadius} > ${boundary}`);
    });
  });
});

test("fixture bodies never swap to marker-only LODs", () => {
  const lighting = buildProjectLighting();
  projectManifest.lights.flatMap(({ fixtures }) => fixtures).forEach(({ id: fixtureId }) => {
    const visual = lighting.root.getObjectByName(fixtureId);
    assert.ok(visual, fixtureId);
    assert.equal(Boolean(visual.getObjectByProperty("type", "LOD")), false, fixtureId);
  });
});

test("only point-light detail uses the exact three-times presentation scale", () => {
  const lighting = buildProjectLighting();
  const pointKinds = new Set(["downlight", "track", "surface"]);
  projectManifest.lights.forEach((definition) => {
    definition.fixtures.forEach((fixture) => {
      const kind = fixture.kind ?? definition.kind ?? "downlight";
      const visual = lighting.root.getObjectByName(fixture.id);
      const detail = visual?.children.find(({ type }) => type === "Group");
      assert.ok(detail, fixture.id);
      assert.deepEqual(visual.scale.toArray(), [1, 1, 1], fixture.id);
      assert.deepEqual(visual.position.toArray(), fixture.position, fixture.id);
      assert.deepEqual(
        detail.scale.toArray(),
        pointKinds.has(kind) ? [3, 3, 3] : [1, 1, 1],
        fixture.id,
      );
    });
  });
});

test("visible point-light hardware keeps the three-times overview dimensions", () => {
  const lighting = buildProjectLighting();
  ["light-hall-spot-01", "light-living-track-spot-01"].forEach((fixtureId) => {
    const visual = lighting.root.getObjectByName(fixtureId);
    assert.ok(visual, fixtureId);
    visual.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(visual, true).getSize(new THREE.Vector3());
    assert.ok(Math.max(size.x, size.z) >= 0.42, `${fixtureId}: ${size.toArray().join(",")}`);
  });
});

test("window glass stays visually clear and nearly colorless", () => {
  const glass = createMaterialRegistry(projectManifest).get("glass-clear");
  assert.ok(glass);
  assert.ok(glass.transmission >= 0.99);
  assert.ok(glass.roughness <= 0.04);
  assert.ok(glass.thickness <= 0.008);
  assert.ok(glass.color.r > 0.85 && glass.color.g > 0.85 && glass.color.b > 0.85);
});

test("full-height invisible wall proxies block cross-room shadows", () => {
  const shadowWalls = buildShadowWalls(projectManifest);
  assert.equal(shadowWalls.children.length, projectManifest.walls.length);

  shadowWalls.children.forEach((wallGroup) => {
    const wall = projectManifest.walls.find(({ id }) => id === wallGroup.userData.wallId);
    assert.ok(wall);
    const bounds = new THREE.Box3().setFromObject(wallGroup, true);
    assert.ok(Math.abs(bounds.max.y - wall.height) < 1e-5, wall.id);
    wallGroup.traverse((object) => {
      if (!object.isMesh) return;
      assert.equal(object.castShadow, true);
      assert.equal(object.receiveShadow, false);
      assert.equal(object.material.colorWrite, false);
      assert.equal(object.material.depthWrite, false);
    });
  });
});

test("shortened walls remain visible from every camera direction", () => {
  const architecture = buildProjectArchitecture();
  const target = new THREE.Vector3(
    architecture.presentation.center.x,
    0.5,
    architecture.presentation.center.y,
  );

  [
    [28, 8, 18],
    [-12, 8, 18],
    [28, 8, -12],
    [-12, 8, -12],
  ].forEach((position) => {
    architecture.walls.forEach((wall) => { wall.visible = true; });
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(...position);
    updateArchitecturePresentation(architecture, {
      camera,
      target,
      enabled: true,
      focusOccluders: true,
    });
    assert.equal(
      [...architecture.walls.values()].every((wall) => wall.visible),
      true,
      `wall disappeared from camera ${position.join(",")}`,
    );
  });
});
