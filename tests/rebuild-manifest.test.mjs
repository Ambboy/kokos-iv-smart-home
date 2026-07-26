import assert from "node:assert/strict";
import test from "node:test";

import legacyManifest from "../src/data/project-manifest.js";
import rebuildManifest from "../src/data/project-manifest-v2.js";
import { validateManifest } from "../src/scene/manifestValidator.js";

const ids = (items) => items.map((item) => item.id);

test("rebuild manifest owns an independent architecture while preserving stable integrations", () => {
  assert.equal(rebuildManifest.meta.version, "0.2.0-rebuild");
  assert.equal(rebuildManifest.meta.geometryRevision, "pdf-architecture-dwg-bindings-v1");
  assert.notEqual(rebuildManifest.shell, legacyManifest.shell);
  assert.notEqual(rebuildManifest.rooms, legacyManifest.rooms);
  assert.notEqual(rebuildManifest.walls, legacyManifest.walls);
  assert.deepEqual(ids(rebuildManifest.rooms), ids(legacyManifest.rooms));
  assert.deepEqual(ids(rebuildManifest.devices), ids(legacyManifest.devices));
  assert.equal(rebuildManifest.rooms.length, 10);
  assert.equal(rebuildManifest.meta.totalReportedArea, 157.59);
});

test("rebuild architecture remains fail-closed and collision free", () => {
  const result = validateManifest(rebuildManifest);
  assert.equal(result.ok, true, result.errors.map((issue) => `${issue.code}: ${issue.message}`).join("\n"));
  assert.equal(result.stats.unresolvedCollisions, 0);
  assert.equal(result.stats.rooms, 10);
  assert.equal(result.stats.walls, 24);
});

test("rebuild source notes distinguish PDF architecture from available DWG bindings", () => {
  assert.match(rebuildManifest.coordinateSystem.note, /PDF.*22.*24.*25/u);
  assert.match(rebuildManifest.coordinateSystem.note, /DWG.*6.*12.*13.*14/u);
  assert.match(rebuildManifest.shell.note, /архитектурн.*DWG.*отсутств/u);
});
