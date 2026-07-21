import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFurnitureColliders,
  intersectObb2D,
  makeObb,
  polygonSelfIntersects,
  polygonsInteriorOverlap,
  validateCollisionStages,
  validateManifestCollisions,
} from "../src/scene/collisionValidator.js";
import projectManifest from "../src/data/project-manifest.js";
import { validateManifest } from "../src/scene/manifestValidator.js";

const source = Object.freeze({
  file: "fixture-design.pdf",
  sheet: "Test sheet",
  pdfPage: 1,
});

function makeValidManifest() {
  return {
    meta: {
      id: "validator-fixture",
      title: "Validator fixture",
      units: "m",
      totalReportedArea: 55.29,
      sourcePdfPhysicalPages: 1,
    },
    coordinateSystem: {
      floorPlane: "X/Z",
      verticalAxis: "Y",
      scale: 1,
      source,
    },
    sources: [source],
    shell: {
      id: "shell",
      exterior: [[0, 0], [10, 0], [10, 6], [0, 6]],
      rawSlabHeight: 3,
      source,
      confidence: "confirmed",
    },
    rooms: [{
      id: "room-a",
      name: "Room A",
      reportedArea: 55.29,
      polygon: [[0.15, 0.15], [9.85, 0.15], [9.85, 5.85], [0.15, 5.85]],
      ceilingHeight: 2.8,
      floorMaterial: "material-object",
      focus: [5, 1, 3],
      source,
      confidence: "confirmed",
    }],
    walls: [{
      id: "wall-north",
      start: [0, 0],
      end: [10, 0],
      height: 3,
      thickness: 0.2,
      materialId: "material-wall",
      source,
      confidence: "confirmed",
    }],
    doors: [{
      id: "door-a",
      roomId: "room-a",
      connects: ["room-a", "outside"],
      wallId: "wall-north",
      offset: 1,
      width: 0.9,
      height: 2.1,
      leafWidth: 0.9,
      leafCount: 1,
      hinge: "start",
      swing: 1,
      source,
      confidence: "confirmed",
    }],
    glazing: [{
      id: "glazing-a",
      roomId: "room-a",
      wallId: "wall-north",
      offset: 3,
      width: 2,
      height: 2.4,
      sill: 0,
      sections: null,
      frameWidth: null,
      operable: null,
      curtainDeviceId: null,
      materialId: "material-glass",
      source,
      confidence: "provisional",
    }],
    openPassages: [],
    furniture: [{
      id: "table-a",
      roomId: "room-a",
      kind: "table",
      position: [5, 0, 3],
      size: [1, 0.75, 1],
      rotationY: Math.PI / 8,
      materialId: "material-object",
      allowedContacts: [],
      source,
      confidence: "proxy",
    }],
    lights: [{
      id: "light-a",
      roomId: "room-a",
      deviceId: "device-light-a",
      kind: "spot",
      group: "room-a-ceiling",
      height: 2.7,
      maxIntensity: 1,
      fixtures: [{
        id: "fixture-a",
        position: [5, 2.7, 2],
        source,
        confidence: "confirmed",
      }],
      source,
      confidence: "confirmed",
    }],
    curtains: [],
    devices: [{
      id: "device-light-a",
      roomId: "room-a",
      kind: "light",
      visualId: "light-a",
      capabilities: ["power", "level"],
      state: "idle",
      level: 0,
      binding: null,
      source,
      confidence: "confirmed",
    }],
    materials: [
      { id: "material-wall", kind: "surface", roughness: 0.8, metalness: 0, source, confidence: "confirmed" },
      { id: "material-object", kind: "surface", roughness: 0.6, metalness: 0, source, confidence: "confirmed" },
      { id: "material-glass", kind: "glass", roughness: 0.08, metalness: 0, transmission: 0.95, opacity: 1, ior: 1.5, thickness: 0.012, source, confidence: "provisional" },
    ],
    scenarios: [],
    allowedContacts: [],
  };
}

function codes(result, severity = "error") {
  return result.issues.filter((issue) => issue.severity === severity).map((issue) => issue.code);
}

test("2.5D OBB SAT detects rotated penetration, separation, and vertical separation", () => {
  const a = makeObb({ id: "a", center: [0, 0.5, 0], size: [2, 1, 1], rotationY: Math.PI / 4 });
  const b = makeObb({ id: "b", center: [0.8, 0.5, 0], size: [1, 1, 1], rotationY: -Math.PI / 6 });
  const far = makeObb({ id: "far", center: [5, 0.5, 0], size: [1, 1, 1], rotationY: 0 });
  const above = makeObb({ id: "above", center: [0, 2, 0], size: [1, 1, 1], rotationY: 0 });

  assert.equal(intersectObb2D(a, b).relation, "penetration");
  assert.equal(intersectObb2D(a, far).intersects, false);
  assert.equal(intersectObb2D(a, above).intersects, false);
  assert.equal(intersectObb2D(a, b).depthM, intersectObb2D(b, a).depthM);
});

test("OBB rotation and composite offsets follow the Three.js positive-Y convention", () => {
  const obb = makeObb({ id: "rotated", center: [0, 0.5, 0], size: [2, 1, 1], rotationY: Math.PI / 2 });
  assert.ok(Math.abs(obb.axes[0][0]) < 1e-9);
  assert.ok(Math.abs(obb.axes[0][1] + 1) < 1e-9);
  assert.ok(Math.abs(obb.axes[1][0] - 1) < 1e-9);

  const [part] = buildFurnitureColliders({
    id: "composite",
    position: [0, 0, 0],
    size: [3, 1, 3],
    rotationY: Math.PI / 2,
    collisionParts: [{ id: "part", offset: [1, 0, 0], size: [0.5, 1, 0.5] }],
  });
  assert.ok(Math.abs(part.center[0]) < 1e-9);
  assert.ok(Math.abs(part.center[2] + 1) < 1e-9);
});

test("polygon topology catches self-intersections and coincident room interiors", () => {
  const bowTie = [[0, 0], [2, 2], [0, 2], [2, 0]];
  const square = [[0, 0], [2, 0], [2, 2], [0, 2]];

  assert.equal(polygonSelfIntersects(bowTie), true);
  assert.equal(polygonSelfIntersects(square), false);
  assert.equal(polygonsInteriorOverlap(square, structuredClone(square)), true);
  assert.equal(polygonsInteriorOverlap(square, [[2, 0], [4, 0], [4, 2], [2, 2]]), false);
});

test("wall solids may meet at junctions but not overlap as parallel independent walls", () => {
  const base = { height: 3, thickness: 0.2 };
  const report = validateManifestCollisions({
    walls: [
      { ...base, id: "wall-a", start: [0, 0], end: [3, 0] },
      { ...base, id: "wall-b", start: [0, 0.1], end: [3, 0.1] },
    ],
  });

  assert.ok(report.issues.some((issue) => issue.code === "WALL_SOLID_OVERLAP"));
});

test("small explicitly declared wall contacts resolve without hiding penetration", () => {
  const report = validateManifestCollisions({
    walls: [{ id: "wall-a", start: [0, 0], end: [3, 0], height: 3, thickness: 0.2 }],
    furniture: [{
      id: "cabinet-a",
      position: [1.5, 0, 0.59],
      size: [1, 1, 1],
      rotationY: 0,
      allowedContacts: ["wall-a"],
    }],
  });

  assert.equal(report.unresolvedCollisions, 0);
  assert.equal(report.resolvedContacts.length, 1);
  assert.ok(report.resolvedContacts[0].depthM > 0);
});

test("coincident confirmed glass panes fail as duplicate glazing", () => {
  const glazing = {
    roomId: "room-a",
    wallId: "wall-a",
    offset: 1,
    width: 1,
    sill: 0,
    height: 2.5,
    confidence: "confirmed",
  };
  const report = validateManifestCollisions({
    walls: [{ id: "wall-a", start: [0, 0], end: [3, 0], height: 3, thickness: 0.2 }],
    glazing: [
      { ...glazing, id: "glass-a" },
      { ...glazing, id: "glass-b" },
    ],
  });

  assert.ok(report.issues.some((issue) => issue.code === "GLAZING_DUPLICATE_OVERLAP" && issue.severity === "error"));
});

test("confirmed fixture manifest passes while provisional glazing stays a warning", () => {
  const result = validateManifest(makeValidManifest());

  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  assert.equal(result.stats.unresolvedCollisions, 0);
  assert.ok(codes(result, "warning").includes("PROVISIONAL_GLAZING"));
  assert.ok(codes(result, "warning").includes("GLAZING_SECTIONS_UNKNOWN"));
});

test("KOKOS IV light manifest matches the user-confirmed generated lighting plan", () => {
  const fixtures = projectManifest.lights.flatMap((group) => group.fixtures.map((fixture) => ({
    roomId: group.roomId,
    kind: fixture.kind ?? group.kind,
  })));
  const roomCounts = Object.fromEntries(projectManifest.rooms.map((room) => [
    room.id,
    fixtures.filter((fixture) => fixture.roomId === room.id).length,
  ]));

  assert.equal(fixtures.length, 59);
  assert.equal(fixtures.filter((fixture) => fixture.kind === "linear").length, 11);
  assert.equal(fixtures.filter((fixture) => ["pendant", "surface"].includes(fixture.kind)).length, 3);
  assert.equal(fixtures.filter((fixture) => !["linear", "pendant", "surface"].includes(fixture.kind)).length, 45);
  assert.deepEqual(roomCounts, {
    "master-bedroom": 8,
    "master-bath": 5,
    wardrobe: 6,
    laundry: 4,
    corridor: 3,
    hall: 3,
    "guest-wc": 1,
    "guest-bedroom": 9,
    "guest-bath": 5,
    "kitchen-living": 15,
  });
  assert.equal(projectManifest.devices.some((device) => device.id === "device-light-guest-pendant"), false);
  assert.equal(projectManifest.devices.some((device) => device.id === "device-light-living-pendant"), false);
});

test("stable ids are globally unique across collections", () => {
  const manifest = makeValidManifest();
  manifest.furniture[0].id = "room-a";
  const result = validateManifest(manifest);

  assert.ok(codes(result).includes("ID_DUPLICATE"));
});

test("unconfirmed glazing geometry still fails closed", () => {
  const manifest = makeValidManifest();
  manifest.glazing[0].offset = 9.5;
  manifest.glazing[0].width = 1;
  const result = validateManifest(manifest);

  assert.ok(codes(result).includes("OPENING_OUTSIDE_WALL"));
  assert.equal(result.ok, false);
});

test("an explicitly provisional shell keeps its provenance warning but invalid geometry fails closed", () => {
  const manifest = makeValidManifest();
  manifest.shell.confidence = "provisional";
  manifest.shell.exterior = [[0, 0], [0, 0], [0, 0]];
  const result = validateManifest(manifest);

  assert.ok(codes(result, "warning").includes("PROVISIONAL_SHELL"));
  assert.ok(codes(result).includes("POLYGON_ZERO_AREA"));
  assert.equal(result.ok, false);
});

test("coincident provisional glass panes also fail closed", () => {
  const manifest = makeValidManifest();
  manifest.glazing.push({ ...structuredClone(manifest.glazing[0]), id: "glazing-b" });
  const result = validateManifest(manifest);

  assert.ok(codes(result).includes("OPENING_OVERLAP"));
  assert.ok(codes(result).includes("GLAZING_DUPLICATE_OVERLAP"));
  assert.ok(result.stats.unresolvedCollisions > 0);
});

test("rotated furniture intersections fail closed", () => {
  const manifest = makeValidManifest();
  manifest.furniture.push({
    ...structuredClone(manifest.furniture[0]),
    id: "table-b",
    position: [5.3, 0, 3],
    rotationY: -Math.PI / 7,
  });
  const result = validateManifest(manifest);

  assert.ok(codes(result).includes("FURNITURE_COLLISION"));
  assert.ok(result.stats.unresolvedCollisions > 0);
});

test("collision checks cannot be disabled without precise sub-colliders", () => {
  const manifest = makeValidManifest();
  manifest.furniture[0].collider = false;
  const disabled = validateManifest(manifest);
  assert.ok(codes(disabled).includes("COLLIDER_DISABLED_WITHOUT_PROXY"));

  manifest.furniture[0].collisionParts = [{ id: "top", offset: [0, 0, 0], size: [1, 0.75, 1], rotationY: 0 }];
  const proxied = validateManifest(manifest);
  assert.ok(!codes(proxied).includes("COLLIDER_DISABLED_WITHOUT_PROXY"));
});

test("door opening envelopes collide with furniture", () => {
  const manifest = makeValidManifest();
  manifest.furniture[0].position = [1.45, 0, 0.45];
  manifest.furniture[0].size = [0.3, 0.75, 0.3];
  manifest.furniture[0].rotationY = 0;
  const result = validateManifest(manifest);

  assert.ok(codes(result).includes("DOOR_SWEEP_COLLISION"));
});

test("device-to-scene visual links are enforced", () => {
  const manifest = makeValidManifest();
  manifest.devices[0].visualId = "missing-light";
  const result = validateManifest(manifest);

  assert.ok(codes(result).includes("DEVICE_VISUAL_LINK_BROKEN"));
});

test("one device links to exactly one grouped scene visual", () => {
  const manifest = makeValidManifest();
  const duplicate = structuredClone(manifest.lights[0]);
  duplicate.id = "light-b";
  duplicate.fixtures[0].id = "fixture-b";
  manifest.lights.push(duplicate);
  const result = validateManifest(manifest);

  assert.ok(codes(result).includes("DEVICE_VISUAL_CARDINALITY_INVALID"));
});

test("entity sources must resolve through the physical-page source registry", () => {
  const manifest = makeValidManifest();
  manifest.furniture[0].source = { file: "other.pdf", sheet: "Unregistered", pdfPage: 1 };
  const result = validateManifest(manifest);

  assert.ok(codes(result).includes("SOURCE_NOT_REGISTERED"));
});

test("secondary source references must also resolve through the registry", () => {
  const manifest = makeValidManifest();
  manifest.furniture[0].sourceRefs = [{ file: "other.pdf", sheet: "Unregistered detail", pdfPage: 1 }];
  const result = validateManifest(manifest);

  assert.ok(codes(result).includes("SOURCE_NOT_REGISTERED"));
});

test("collision stages replay the construction order and finish with the full report", () => {
  const manifest = makeValidManifest();
  const stages = validateCollisionStages(manifest);

  assert.deepEqual(stages.map((stage) => stage.id), ["architecture", "openings", "glazing", "furniture", "lighting", "curtains"]);
  assert.equal(stages.at(-1).unresolvedCollisions, validateManifestCollisions(manifest).unresolvedCollisions);
});

test("room topology and explication area mismatches are reported", () => {
  const manifest = makeValidManifest();
  manifest.rooms.push({
    ...structuredClone(manifest.rooms[0]),
    id: "room-b",
    polygon: [[8, 4], [9.5, 4], [9.5, 5.5], [8, 5.5]],
    reportedArea: 2.25,
  });
  manifest.rooms[0].reportedArea = 50;
  const result = validateManifest(manifest);

  assert.ok(codes(result).includes("ROOM_OVERLAP"));
  assert.ok(codes(result).includes("ROOM_AREA_MISMATCH"));
  assert.ok(codes(result).includes("EXPLICATION_SUM_MISMATCH"));
});
