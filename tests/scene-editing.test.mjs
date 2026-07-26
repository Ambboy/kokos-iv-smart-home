import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import projectManifest from "../src/data/project-manifest-v2.js";
import {
  applySceneEdits,
  appendWallEdit,
  hideFurnitureEdit,
  isValidWallEdit,
  normalizeEditorState,
  persistEditorState,
} from "../src/editor/editModel.js";
import { buildWall, DISPLAY_WALL_HEIGHT_SCALE } from "../src/scene/buildArchitecture.js";
import { buildFurniture } from "../src/scene/buildFurniture.js";
import { validateManifest } from "../src/scene/manifestValidator.js";
import { createMaterialRegistry } from "../src/scene/sceneUtils.js";

test("editor persistence fails softly when browser storage is unavailable", () => {
  assert.equal(persistEditorState(() => { throw new Error("storage denied"); }, {
    walls: [],
    hiddenFurnitureIds: [],
  }), false);
});

test("editor rejects malformed persisted geometry and duplicate wall ids", () => {
  const state = normalizeEditorState({
    walls: [
      { id: "edit-wall-good", start: [1, 2], end: [3, 4] },
      { id: "edit-wall-good", start: [4, 5], end: [6, 7] },
      { id: "bad-id", start: [1, 2], end: [3, 4] },
      { id: "edit-wall-string", start: ["1", 2], end: [3, 4] },
      { id: "edit-wall-huge", start: [1e300, 2], end: [3, 4] },
    ],
    hiddenFurnitureIds: ["hall-bench", "hall-bench", null],
  });
  assert.deepEqual(state.walls, [{ id: "edit-wall-good", start: [1, 2], end: [3, 4] }]);
  assert.deepEqual(state.hiddenFurnitureIds, ["hall-bench"]);
  assert.deepEqual(appendWallEdit(state, null), state);
  assert.equal(isValidWallEdit({ id: "edit-wall-short", start: [1, 1], end: [1.05, 1.05] }), false);
  assert.equal(isValidWallEdit({ id: "edit-wall-valid", start: [1, 1], end: [1.2, 1] }), true);
});

test("editor adds a wall and removes selected furniture without mutating the source manifest", () => {
  const sourceWallCount = projectManifest.walls.length;
  const sourceFurnitureCount = projectManifest.furniture.length;
  let state = { walls: [], hiddenFurnitureIds: [] };
  state = appendWallEdit(state, {
    id: "edit-wall-test",
    start: [7.1, 8.1],
    end: [8.4, 8.1],
  });
  state = hideFurnitureEdit(state, "hall-bench");
  const edited = applySceneEdits(projectManifest, state);

  assert.equal(edited.walls.at(-1).id, "edit-wall-test");
  assert.equal(edited.walls.at(-1).height, 3.405);
  assert.equal(edited.furniture.some((item) => item.id === "hall-bench"), false);
  assert.equal(projectManifest.walls.length, sourceWallCount);
  assert.equal(projectManifest.furniture.length, sourceFurnitureCount);
});

test("hiding built-in furniture also removes its allowed-contact reference", () => {
  const state = hideFurnitureEdit({ walls: [], hiddenFurnitureIds: [] }, "wardrobe-system");
  const edited = applySceneEdits(projectManifest, state);
  const validation = validateManifest(edited);
  assert.equal(edited.allowedContacts.some((contact) => contact.objectIds?.includes("wardrobe-system")), false);
  assert.equal(validation.errors.some((issue) => issue.code === "ALLOWED_CONTACT_REF_UNKNOWN"), false);
});

test("hall passage is clear of the misplaced cabinet", () => {
  assert.equal(projectManifest.furniture.some((item) => item.id === "hall-cabinet-main"), false);
});

test("display walls are one third of their architectural height", () => {
  assert.equal(DISPLAY_WALL_HEIGHT_SCALE, 1 / 3);
  const materials = createMaterialRegistry(projectManifest);
  const wall = projectManifest.walls.find((item) => item.id === "wall-master-bath");
  const built = buildWall(wall, projectManifest, materials.get("wall-warm-greige"));
  const bounds = new THREE.Box3().setFromObject(built, true);
  assert.ok(Math.abs(bounds.max.y - wall.height / 3) < 0.001);
});

test("kitchen and island countertop inserts avoid coplanar faces", () => {
  const materials = createMaterialRegistry(projectManifest);
  const furniture = buildFurniture({ manifest: projectManifest, materials });
  const kitchen = furniture.items.get("kitchen-run")?.group;
  const countertop = kitchen?.getObjectByName("kitchen-countertop");
  const cooktop = kitchen?.getObjectByName("kitchen-cooktop");
  const sink = kitchen?.getObjectByName("kitchen-sink-recess");
  const island = furniture.items.get("kitchen-island")?.group;
  const islandCountertop = island?.getObjectByName("island-overhang-countertop");
  const islandSink = island?.getObjectByName("island-sink-recess");
  assert.ok(countertop && cooktop && sink && islandCountertop && islandSink);
  kitchen.updateMatrixWorld(true);
  island.updateMatrixWorld(true);
  const countertopBox = new THREE.Box3().setFromObject(countertop, true);
  const cooktopBox = new THREE.Box3().setFromObject(cooktop, true);
  const sinkBox = new THREE.Box3().setFromObject(sink, true);
  const islandCountertopBox = new THREE.Box3().setFromObject(islandCountertop, true);
  const islandSinkBox = new THREE.Box3().setFromObject(islandSink, true);
  assert.ok(cooktopBox.min.y >= countertopBox.max.y + 0.002);
  assert.ok(sinkBox.min.y >= countertopBox.max.y + 0.002);
  assert.ok(islandSinkBox.min.y >= islandCountertopBox.max.y + 0.002);
});
