import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import projectManifest from "../src/data/project-manifest-v2.js";
import { buildLights } from "../src/scene/buildLights.js";
import { createMaterialRegistry } from "../src/scene/sceneUtils.js";

const lighting = buildLights({
  manifest: projectManifest,
  materials: createMaterialRegistry(projectManifest),
});
lighting.root.updateMatrixWorld(true);

const targetByFixtureId = new Map(
  lighting.hitTargets.map((target) => [target.userData.fixtureId, target]),
);
const layouts = [
  {
    kind: "downlight",
    fixtureIds: ["light-hall-spot-01", "light-hall-spot-02"],
  },
  {
    kind: "track",
    fixtureIds: ["light-living-track-spot-01", "light-living-track-spot-04"],
  },
];
const EXPANDED_EDGE_OFFSET = 0.22;

function raycast(origin, direction, targets) {
  const raycaster = new THREE.Raycaster(origin, direction.clone().normalize());
  return raycaster.intersectObjects(targets, false);
}

function verticalHitsAt(target, x, z, targets) {
  return raycast(
    new THREE.Vector3(x, target.position.y - 2, z),
    new THREE.Vector3(0, 1, 0),
    targets,
  );
}

test("point light fixtures expose finger-sized invisible touch targets", () => {
  const pointTargets = lighting.hitTargets.filter((target) => (
    target.userData.fixtureKind === "downlight" || target.userData.fixtureKind === "track"
  ));

  assert.ok(pointTargets.length > 0);
  pointTargets.forEach((target) => {
    const size = new THREE.Box3().setFromObject(target, true).getSize(new THREE.Vector3());
    assert.ok(size.x >= EXPANDED_EDGE_OFFSET * 2);
    assert.ok(size.z >= EXPANDED_EDGE_OFFSET * 2);
    assert.equal(target.material.opacity, 0);
    assert.equal(target.material.colorWrite, false);
    assert.equal(target.material.depthWrite, false);
  });
});

test("every invisible touch target encloses its complete visible fixture", () => {
  const epsilon = 1e-6;
  assert.equal(lighting.hitTargets.length, 59);
  lighting.hitTargets.forEach((target) => {
    const visual = lighting.root.getObjectByName(target.userData.fixtureId);
    assert.ok(visual, target.userData.fixtureId);
    const visualBounds = new THREE.Box3().setFromObject(visual, true);
    const targetBounds = new THREE.Box3().setFromObject(target, true);
    assert.ok(targetBounds.min.x <= visualBounds.min.x + epsilon, target.userData.fixtureId);
    assert.ok(targetBounds.min.y <= visualBounds.min.y + epsilon, target.userData.fixtureId);
    assert.ok(targetBounds.min.z <= visualBounds.min.z + epsilon, target.userData.fixtureId);
    assert.ok(targetBounds.max.x >= visualBounds.max.x - epsilon, target.userData.fixtureId);
    assert.ok(targetBounds.max.y >= visualBounds.max.y - epsilon, target.userData.fixtureId);
    assert.ok(targetBounds.max.z >= visualBounds.max.z - epsilon, target.userData.fixtureId);
  });
});

test("all fixture kinds raycast at their centers and visible bounds edges", () => {
  lighting.root.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);

  lighting.hitTargets.forEach((target) => {
    const bounds = new THREE.Box3().setFromObject(target, true);
    const center = bounds.getCenter(new THREE.Vector3());
    const edge = new THREE.Vector3(bounds.max.x - 1e-4, center.y, center.z);

    [center, edge].forEach((point) => {
      raycaster.set(new THREE.Vector3(point.x, bounds.max.y + 2, point.z), down);
      assert.ok(raycaster.intersectObject(target, false).length > 0, target.userData.fixtureId);
    });

    raycaster.set(new THREE.Vector3(center.x, bounds.max.y + 2, center.z), down);
    const nearest = raycaster.intersectObjects(lighting.hitTargets, false)[0]?.object;
    assert.equal(nearest?.userData.deviceId, target.userData.deviceId, target.userData.fixtureId);
  });
});

test("real downlight and track layouts raycast at fixture centers and expanded edges", async (t) => {
  for (const layout of layouts) {
    await t.test(layout.kind, () => {
      const targets = layout.fixtureIds.map((fixtureId) => targetByFixtureId.get(fixtureId));
      const [target, adjacent] = targets;
      assert.ok(target && adjacent);

      const centerHits = verticalHitsAt(target, target.position.x, target.position.z, targets);
      assert.equal(centerHits[0]?.object.userData.fixtureId, layout.fixtureIds[0]);

      const towardAdjacent = adjacent.position.clone().sub(target.position).setY(0).normalize();
      const edgePoint = target.position.clone().addScaledVector(towardAdjacent, EXPANDED_EDGE_OFFSET);
      const edgeHits = verticalHitsAt(target, edgePoint.x, edgePoint.z, targets);
      assert.equal(edgeHits[0]?.object.userData.fixtureId, layout.fixtureIds[0]);
      assert.equal(edgeHits.some(({ object }) => object === adjacent), false);
    });
  }
});

test("adjacent real-project fixtures leave an unambiguous gap between touch targets", async (t) => {
  for (const layout of layouts) {
    await t.test(layout.kind, () => {
      const targets = layout.fixtureIds.map((fixtureId) => targetByFixtureId.get(fixtureId));
      const midpoint = targets[0].position.clone().lerp(targets[1].position, 0.5);
      const midpointHits = verticalHitsAt(targets[0], midpoint.x, midpoint.z, targets);
      assert.deepEqual(midpointHits, []);
    });
  }
});

test("raycasting through adjacent fixtures selects the nearest target", async (t) => {
  for (const layout of layouts) {
    await t.test(layout.kind, () => {
      const targets = layout.fixtureIds.map((fixtureId) => targetByFixtureId.get(fixtureId));
      const direction = targets[1].position.clone().sub(targets[0].position).normalize();
      const origin = targets[0].position.clone().addScaledVector(direction, -1);
      const hits = raycast(origin, direction, targets);

      assert.equal(hits[0]?.object.userData.fixtureId, layout.fixtureIds[0]);
      assert.equal(hits.some(({ object }) => object === targets[1]), true);
    });
  }
});
