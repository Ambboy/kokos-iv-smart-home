const DEFAULT_EPSILON = 1e-6;

export const COLLISION_DEFAULTS = Object.freeze({
  epsilon: DEFAULT_EPSILON,
  contactToleranceM: 0.002,
  allowedContactPenetrationM: 0.025,
  doorSweepChordErrorM: 0.002,
  fixtureSizeM: 0.06,
  glassThicknessM: 0.012,
  curtainThicknessM: 0.04,
});

const finite = Number.isFinite;
const sq = (value) => value * value;
const distance2 = (a, b) => sq(a[0] - b[0]) + sq(a[1] - b[1]);
const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

export function polygonArea(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return Number.NaN;
  return Math.abs(polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0)) / 2;
}

function pointOnSegment(point, start, end, epsilon = DEFAULT_EPSILON) {
  if (Math.abs(cross2(start, end, point)) > epsilon) return false;
  return point[0] >= Math.min(start[0], end[0]) - epsilon
    && point[0] <= Math.max(start[0], end[0]) + epsilon
    && point[1] >= Math.min(start[1], end[1]) - epsilon
    && point[1] <= Math.max(start[1], end[1]) + epsilon;
}

export function classifyPointInPolygon(point, polygon, epsilon = DEFAULT_EPSILON) {
  if (!Array.isArray(point) || !Array.isArray(polygon) || polygon.length < 3) return "outside";
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[previous];
    const b = polygon[index];
    if (pointOnSegment(point, a, b, epsilon)) return "boundary";
    const crosses = (a[1] > point[1]) !== (b[1] > point[1]);
    if (!crosses) continue;
    const intersectionX = ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0];
    if (point[0] < intersectionX) inside = !inside;
  }
  return inside ? "inside" : "outside";
}

function segmentIntersectionType(a, b, c, d, epsilon = DEFAULT_EPSILON) {
  const abC = cross2(a, b, c);
  const abD = cross2(a, b, d);
  const cdA = cross2(c, d, a);
  const cdB = cross2(c, d, b);
  const signsOppose = (x, y) => (x > epsilon && y < -epsilon) || (x < -epsilon && y > epsilon);

  if (signsOppose(abC, abD) && signsOppose(cdA, cdB)) return "proper";

  const touches = [
    Math.abs(abC) <= epsilon && pointOnSegment(c, a, b, epsilon),
    Math.abs(abD) <= epsilon && pointOnSegment(d, a, b, epsilon),
    Math.abs(cdA) <= epsilon && pointOnSegment(a, c, d, epsilon),
    Math.abs(cdB) <= epsilon && pointOnSegment(b, c, d, epsilon),
  ];
  if (!touches.some(Boolean)) return "none";

  const collinear = Math.abs(abC) <= epsilon
    && Math.abs(abD) <= epsilon
    && Math.abs(cdA) <= epsilon
    && Math.abs(cdB) <= epsilon;
  if (!collinear) return "touch";

  const useX = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
  const axis = useX ? 0 : 1;
  const overlap = Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis]))
    - Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis]));
  return overlap > epsilon ? "overlap" : "touch";
}

function polygonEdges(polygon) {
  return polygon.map((point, index) => [point, polygon[(index + 1) % polygon.length]]);
}

function interiorEdgeProbes(polygon, epsilon) {
  const probes = [];
  for (const [start, end] of polygonEdges(polygon)) {
    const dx = end[0] - start[0];
    const dz = end[1] - start[1];
    const length = Math.hypot(dx, dz);
    if (length <= epsilon) continue;
    const midpoint = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    const distance = Math.max(epsilon * 10, Math.min(length * 1e-4, 1e-3));
    const normal = [-dz / length, dx / length];
    for (const sign of [-1, 1]) {
      const point = [midpoint[0] + normal[0] * distance * sign, midpoint[1] + normal[1] * distance * sign];
      if (classifyPointInPolygon(point, polygon, epsilon) === "inside") probes.push(point);
    }
  }
  return probes;
}

export function polygonSelfIntersects(polygon, epsilon = DEFAULT_EPSILON) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  const normalized = polygon.filter((point, index) => index === 0 || distance2(point, polygon[index - 1]) > epsilon * epsilon);
  if (normalized.length > 1 && distance2(normalized[0], normalized.at(-1)) <= epsilon * epsilon) normalized.pop();
  if (normalized.length < 3) return false;
  const edges = polygonEdges(normalized);
  for (let aIndex = 0; aIndex < edges.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < edges.length; bIndex += 1) {
      const adjacent = bIndex === aIndex + 1 || (aIndex === 0 && bIndex === edges.length - 1);
      if (adjacent) continue;
      if (segmentIntersectionType(...edges[aIndex], ...edges[bIndex], epsilon) !== "none") return true;
    }
  }
  return false;
}

export function polygonsInteriorOverlap(a, b, epsilon = DEFAULT_EPSILON) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 3 || b.length < 3) return false;
  for (const [a0, a1] of polygonEdges(a)) {
    for (const [b0, b1] of polygonEdges(b)) {
      if (segmentIntersectionType(a0, a1, b0, b1, epsilon) === "proper") return true;
    }
  }
  return a.some((point) => classifyPointInPolygon(point, b, epsilon) === "inside")
    || b.some((point) => classifyPointInPolygon(point, a, epsilon) === "inside")
    || interiorEdgeProbes(a, epsilon).some((point) => classifyPointInPolygon(point, b, epsilon) === "inside")
    || interiorEdgeProbes(b, epsilon).some((point) => classifyPointInPolygon(point, a, epsilon) === "inside");
}

export function polygonContainsPolygon(container, candidate, epsilon = DEFAULT_EPSILON) {
  if (!Array.isArray(container) || !Array.isArray(candidate) || candidate.length < 3) return false;
  if (candidate.some((point) => classifyPointInPolygon(point, container, epsilon) === "outside")) return false;
  for (const [a0, a1] of polygonEdges(candidate)) {
    for (const [b0, b1] of polygonEdges(container)) {
      if (segmentIntersectionType(a0, a1, b0, b1, epsilon) === "proper") return false;
    }
  }
  return true;
}

export function makeObb({ id, ownerId = id, kind = "object", center, size, rotationY = 0, metadata = {} }) {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return {
    id,
    ownerId,
    kind,
    center: [...center],
    half: [size[0] / 2, size[1] / 2, size[2] / 2],
    rotationY,
    // Three.js positive Y rotation maps local +X toward -Z and local +Z toward +X.
    axes: [[cos, -sin], [sin, cos]],
    metadata,
  };
}

export function obbFootprint(obb) {
  const [axisX, axisZ] = obb.axes;
  const [halfX, , halfZ] = obb.half;
  const center = [obb.center[0], obb.center[2]];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => [
    center[0] + axisX[0] * halfX * sx + axisZ[0] * halfZ * sz,
    center[1] + axisX[1] * halfX * sx + axisZ[1] * halfZ * sz,
  ]);
}

export function intersectObb2D(a, b, options = {}) {
  const epsilon = options.epsilon ?? COLLISION_DEFAULTS.epsilon;
  const contactToleranceM = options.contactToleranceM ?? COLLISION_DEFAULTS.contactToleranceM;
  const delta = [b.center[0] - a.center[0], b.center[2] - a.center[2]];
  let minimumOverlap = Number.POSITIVE_INFINITY;
  let minimumAxis = null;

  for (const axis of [...a.axes, ...b.axes]) {
    const radiusA = a.half[0] * Math.abs(dot2(a.axes[0], axis))
      + a.half[2] * Math.abs(dot2(a.axes[1], axis));
    const radiusB = b.half[0] * Math.abs(dot2(b.axes[0], axis))
      + b.half[2] * Math.abs(dot2(b.axes[1], axis));
    const overlap = radiusA + radiusB - Math.abs(dot2(delta, axis));
    if (overlap < -epsilon) return { intersects: false, relation: "separate", depthM: 0, axis: null };
    if (overlap < minimumOverlap) {
      minimumOverlap = overlap;
      minimumAxis = [...axis];
    }
  }

  const aMinY = a.center[1] - a.half[1];
  const aMaxY = a.center[1] + a.half[1];
  const bMinY = b.center[1] - b.half[1];
  const bMaxY = b.center[1] + b.half[1];
  const overlapY = Math.min(aMaxY, bMaxY) - Math.max(aMinY, bMinY);
  if (overlapY < -epsilon) return { intersects: false, relation: "separate", depthM: 0, axis: null };

  const depthM = Math.max(0, Math.min(minimumOverlap, overlapY));
  return {
    intersects: true,
    relation: minimumOverlap <= contactToleranceM || overlapY <= contactToleranceM ? "touch" : "penetration",
    depthM,
    axis: minimumAxis,
  };
}

function wallGeometry(wall) {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dz);
  return {
    length,
    tangent: length > 0 ? [dx / length, dz / length] : [1, 0],
    rotationY: -Math.atan2(dz, dx),
  };
}

function collectWallCuts(manifest, wallId) {
  const cuts = [];
  for (const door of manifest.doors ?? []) {
    if (door.wallId === wallId) cuts.push({ start: door.offset, end: door.offset + door.width, bottom: 0, top: door.height, ownerId: door.id });
  }
  for (const passage of manifest.openPassages ?? []) {
    if (passage.wallId === wallId) cuts.push({ start: passage.offset, end: passage.offset + passage.width, bottom: 0, top: passage.height, ownerId: passage.id });
  }
  for (const glazing of manifest.glazing ?? []) {
    if (glazing.wallId === wallId) cuts.push({ start: glazing.offset, end: glazing.offset + glazing.width, bottom: glazing.sill, top: glazing.sill + glazing.height, ownerId: glazing.id });
  }
  return cuts.filter((cut) => [cut.start, cut.end, cut.bottom, cut.top].every(finite));
}

function subtractVerticalIntervals(height, openings, epsilon) {
  const normalized = openings
    .map(([start, end]) => [Math.max(0, start), Math.min(height, end)])
    .filter(([start, end]) => end - start > epsilon)
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const interval of normalized) {
    const last = merged.at(-1);
    if (last && interval[0] <= last[1] + epsilon) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  const opaque = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start - cursor > epsilon) opaque.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (height - cursor > epsilon) opaque.push([cursor, height]);
  return opaque;
}

export function buildWallColliders(manifest, options = {}) {
  const epsilon = options.epsilon ?? COLLISION_DEFAULTS.epsilon;
  const colliders = [];
  for (const wall of manifest.walls ?? []) {
    const geometry = wallGeometry(wall);
    if (!(geometry.length > epsilon) || !(wall.height > 0) || !(wall.thickness > 0)) continue;
    const cuts = collectWallCuts(manifest, wall.id);
    const boundaries = [0, geometry.length];
    for (const cut of cuts) boundaries.push(Math.max(0, Math.min(geometry.length, cut.start)), Math.max(0, Math.min(geometry.length, cut.end)));
    const sorted = [...new Set(boundaries.map((value) => Number(value.toFixed(9))))].sort((a, b) => a - b);
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const start = sorted[index];
      const end = sorted[index + 1];
      if (end - start <= epsilon) continue;
      const midpoint = (start + end) / 2;
      const activeOpenings = cuts
        .filter((cut) => midpoint > cut.start - epsilon && midpoint < cut.end + epsilon)
        .map((cut) => [cut.bottom, cut.top]);
      const verticalSpans = subtractVerticalIntervals(wall.height, activeOpenings, epsilon);
      for (let verticalIndex = 0; verticalIndex < verticalSpans.length; verticalIndex += 1) {
        const [bottom, top] = verticalSpans[verticalIndex];
        const distance = (start + end) / 2;
        colliders.push(makeObb({
          id: `${wall.id}:span-${index}:vertical-${verticalIndex}`,
          ownerId: wall.id,
          kind: "wall",
          center: [
            wall.start[0] + geometry.tangent[0] * distance,
            (bottom + top) / 2,
            wall.start[1] + geometry.tangent[1] * distance,
          ],
          size: [end - start, top - bottom, wall.thickness],
          rotationY: geometry.rotationY,
          metadata: { wall, start, end, bottom, top },
        }));
      }
    }
  }
  return colliders;
}

export function buildFurnitureColliders(item) {
  if (!Array.isArray(item.position) || !Array.isArray(item.size)) return [];
  if (![...item.position, ...item.size, item.rotationY].every(finite)) return [];
  if (Array.isArray(item.collisionParts) && item.collisionParts.length > 0) {
    const cos = Math.cos(item.rotationY);
    const sin = Math.sin(item.rotationY);
    return item.collisionParts.flatMap((part, index) => {
      const offset = part.offset ?? [0, 0, 0];
      if (!Array.isArray(offset) || !Array.isArray(part.size) || ![...offset, ...part.size, part.rotationY ?? 0].every(finite) || part.size.some((value) => value <= 0)) return [];
      return [makeObb({
        id: `${item.id}:${part.id ?? `part-${index + 1}`}`,
        ownerId: item.id,
        kind: "furniture",
        center: [
          item.position[0] + cos * offset[0] + sin * offset[2],
          item.position[1] + offset[1] + part.size[1] / 2,
          item.position[2] - sin * offset[0] + cos * offset[2],
        ],
        size: part.size,
        rotationY: item.rotationY + (part.rotationY ?? 0),
        metadata: { item, part },
      })];
    });
  }
  if (item.collider === false) return [];
  return [makeObb({
    id: `${item.id}:body`,
    ownerId: item.id,
    kind: "furniture",
    center: [item.position[0], item.position[1] + item.size[1] / 2, item.position[2]],
    size: item.size,
    rotationY: item.rotationY,
    metadata: { item },
  })];
}

function fixtureCollider(group, fixture, options) {
  const fallbackSize = options.fixtureSizeM ?? COLLISION_DEFAULTS.fixtureSizeM;
  if (!Array.isArray(fixture.position) || !fixture.position.every(finite)) return null;
  const size = Array.isArray(fixture.size) && fixture.size.length === 3 && fixture.size.every(finite)
    ? fixture.size
    : [fallbackSize, fallbackSize, fallbackSize];
  return makeObb({
    id: `${fixture.id}:visual`,
    ownerId: fixture.id,
    kind: "fixture",
    center: fixture.position,
    size,
    rotationY: finite(fixture.rotationY) ? fixture.rotationY : 0,
    metadata: { group, fixture },
  });
}

function openingCenter(wall, offset, width) {
  const geometry = wallGeometry(wall);
  const distance = offset + width / 2;
  return {
    geometry,
    point: [wall.start[0] + geometry.tangent[0] * distance, wall.start[1] + geometry.tangent[1] * distance],
  };
}

function glazingCollider(glazing, wall, options) {
  const { geometry, point } = openingCenter(wall, glazing.offset, glazing.width);
  return makeObb({
    id: `${glazing.id}:glass`,
    ownerId: glazing.id,
    kind: "glass",
    center: [point[0], glazing.sill + glazing.height / 2, point[1]],
    size: [glazing.width, glazing.height, options.glassThicknessM ?? COLLISION_DEFAULTS.glassThicknessM],
    rotationY: geometry.rotationY,
    metadata: { glazing, wall },
  });
}

function curtainCollider(curtain, glazing, wall, room, options) {
  const { geometry, point } = openingCenter(wall, glazing.offset, glazing.width);
  const normals = [[-geometry.tangent[1], geometry.tangent[0]], [geometry.tangent[1], -geometry.tangent[0]]];
  const inward = normals.find((normal) => room && classifyPointInPolygon([
    point[0] + normal[0] * 0.25,
    point[1] + normal[1] * 0.25,
  ], room.polygon) !== "outside") ?? normals[0];
  const offset = curtain.offsetFromGlass ?? 0.1;
  const edgeClearance = Math.max(0, curtain.edgeClearance ?? 0);
  const effectiveWidth = Math.max(options.epsilon ?? DEFAULT_EPSILON, curtain.width - edgeClearance * 2);
  return makeObb({
    id: `${curtain.id}:fabric`,
    ownerId: curtain.id,
    kind: "curtain",
    center: [point[0] + inward[0] * offset, curtain.height / 2, point[1] + inward[1] * offset],
    size: [effectiveWidth, curtain.height, options.curtainThicknessM ?? COLLISION_DEFAULTS.curtainThicknessM],
    rotationY: geometry.rotationY,
    metadata: { curtain, glazing, wall },
  });
}

function sectorSteps(radius, angle, chordError) {
  if (!(radius > 0) || !(chordError > 0) || chordError >= radius) return Math.max(4, Math.ceil(Math.abs(angle) / (Math.PI / 36)));
  const maxStep = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - chordError / radius)));
  return Math.max(4, Math.ceil(Math.abs(angle) / maxStep));
}

function makeSector(hinge, baseVector, radius, signedAngle, chordError) {
  const baseAngle = Math.atan2(baseVector[1], baseVector[0]);
  const steps = sectorSteps(radius, signedAngle, chordError);
  const polygon = [[...hinge]];
  for (let index = 0; index <= steps; index += 1) {
    const angle = baseAngle + signedAngle * (index / steps);
    polygon.push([hinge[0] + Math.cos(angle) * radius, hinge[1] + Math.sin(angle) * radius]);
  }
  return polygon;
}

export function buildDoorSweeps(manifest, options = {}) {
  const chordError = options.doorSweepChordErrorM ?? COLLISION_DEFAULTS.doorSweepChordErrorM;
  const walls = new Map((manifest.walls ?? []).map((wall) => [wall.id, wall]));
  const sweeps = [];
  for (const door of manifest.doors ?? []) {
    const wall = walls.get(door.wallId);
    const leafWidths = Array.isArray(door.leafWidths)
      ? door.leafWidths
      : Array.from({ length: door.leafCount ?? 1 }, () => door.leafWidth);
    if (!wall || ![door.offset, door.width, ...leafWidths].every(finite)) continue;
    const geometry = wallGeometry(wall);
    if (!(geometry.length > 0)) continue;
    const openingStart = [wall.start[0] + geometry.tangent[0] * door.offset, wall.start[1] + geometry.tangent[1] * door.offset];
    const openingEnd = [wall.start[0] + geometry.tangent[0] * (door.offset + door.width), wall.start[1] + geometry.tangent[1] * (door.offset + door.width)];
    const angle = door.openAngle ?? Math.PI / 2;
    const swing = door.swing ?? 1;
    const leaves = door.leafCount === 2 || door.hinge === "outer"
      ? [
        { hinge: openingStart, base: geometry.tangent, sign: swing, index: 0, width: leafWidths[0] },
        { hinge: openingEnd, base: [-geometry.tangent[0], -geometry.tangent[1]], sign: -swing, index: 1, width: leafWidths[1] },
      ]
      : [{
        hinge: door.hinge === "end" ? openingEnd : openingStart,
        base: door.hinge === "end" ? [-geometry.tangent[0], -geometry.tangent[1]] : geometry.tangent,
        sign: swing,
        index: 0,
        width: leafWidths[0],
      }];
    for (const leaf of leaves) {
      sweeps.push({
        id: `${door.id}:sweep-${leaf.index + 1}`,
        doorId: door.id,
        wallId: wall.id,
        hinge: leaf.hinge,
        polygon: makeSector(leaf.hinge, leaf.base, leaf.width, leaf.sign * angle, chordError),
        bottom: 0,
        top: Math.min(door.height, door.leafHeight ?? door.height),
      });
    }
  }
  return sweeps;
}

function lineIntersectionPoint(a, b, c, d) {
  const denominator = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]);
  if (Math.abs(denominator) <= DEFAULT_EPSILON) return null;
  const determinantA = a[0] * b[1] - a[1] * b[0];
  const determinantB = c[0] * d[1] - c[1] * d[0];
  return [
    (determinantA * (c[0] - d[0]) - (a[0] - b[0]) * determinantB) / denominator,
    (determinantA * (c[1] - d[1]) - (a[1] - b[1]) * determinantB) / denominator,
  ];
}

function isEndpoint(point, segmentStart, segmentEnd, epsilon) {
  return distance2(point, segmentStart) <= epsilon * epsilon || distance2(point, segmentEnd) <= epsilon * epsilon;
}

function issue(code, message, entityIds, debug = undefined, severity = "error") {
  return { code, severity, message, entityIds, ...(debug ? { debug } : {}) };
}

function validateWallTopology(walls, options) {
  const epsilon = options.contactToleranceM;
  const issues = [];
  for (let aIndex = 0; aIndex < walls.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < walls.length; bIndex += 1) {
      const a = walls[aIndex];
      const b = walls[bIndex];
      const type = segmentIntersectionType(a.start, a.end, b.start, b.end, epsilon);
      if (type === "none") {
        const geometryA = wallGeometry(a);
        const geometryB = wallGeometry(b);
        if ([geometryA.length, geometryB.length, a.height, b.height, a.thickness, b.thickness].every((value) => finite(value) && value > 0)) {
          const colliderA = makeObb({
            id: `${a.id}:solid`,
            ownerId: a.id,
            kind: "wall",
            center: [(a.start[0] + a.end[0]) / 2, a.height / 2, (a.start[1] + a.end[1]) / 2],
            size: [geometryA.length, a.height, a.thickness],
            rotationY: geometryA.rotationY,
          });
          const colliderB = makeObb({
            id: `${b.id}:solid`,
            ownerId: b.id,
            kind: "wall",
            center: [(b.start[0] + b.end[0]) / 2, b.height / 2, (b.start[1] + b.end[1]) / 2],
            size: [geometryB.length, b.height, b.thickness],
            rotationY: geometryB.rotationY,
          });
          const result = intersectObb2D(colliderA, colliderB, options);
          if (result.intersects && result.relation === "penetration") issues.push(issue("WALL_SOLID_OVERLAP", `Wall solids ${a.id} and ${b.id} overlap without a centerline junction.`, [a.id, b.id], { depthM: result.depthM }));
        }
        continue;
      }
      if (type === "touch") continue;
      if (type === "overlap") {
        issues.push(issue("WALL_OVERLAP", `Walls ${a.id} and ${b.id} overlap along their centerlines.`, [a.id, b.id]));
        continue;
      }
      const point = lineIntersectionPoint(a.start, a.end, b.start, b.end);
      const declaredJunction = point && (isEndpoint(point, a.start, a.end, epsilon) || isEndpoint(point, b.start, b.end, epsilon));
      if (!declaredJunction) issues.push(issue("WALL_CROSSING", `Walls ${a.id} and ${b.id} cross away from a derived endpoint junction.`, [a.id, b.id], { point }));
    }
  }
  return issues;
}

function allowedObjectContact(item, targetId, intersection, options) {
  if (!(item.allowedContacts ?? []).includes(targetId)) return false;
  return intersection.depthM <= options.allowedContactPenetrationM;
}

function collisionPairCode(a, b) {
  const kinds = [a.kind, b.kind].sort().join(":");
  if (kinds === "furniture:furniture") return "FURNITURE_COLLISION";
  if (kinds === "furniture:wall") return "FURNITURE_WALL_COLLISION";
  if (kinds === "fixture:wall") return "FIXTURE_WALL_COLLISION";
  if (kinds === "curtain:furniture") return "CURTAIN_FURNITURE_COLLISION";
  if (kinds === "curtain:wall") return "CURTAIN_WALL_COLLISION";
  return "OBJECT_COLLISION";
}

export function validateManifestCollisions(manifest, overrides = {}) {
  const options = { ...COLLISION_DEFAULTS, ...overrides };
  const issues = validateWallTopology(manifest.walls ?? [], options);
  const resolvedContacts = [];
  const wallColliders = buildWallColliders(manifest, options);
  const furniture = (manifest.furniture ?? []).flatMap(buildFurnitureColliders);
  const fixtures = (manifest.lights ?? []).flatMap((group) => (group.fixtures ?? []).map((item) => fixtureCollider(group, item, options))).filter(Boolean);
  const roomById = new Map((manifest.rooms ?? []).map((room) => [room.id, room]));
  const wallById = new Map((manifest.walls ?? []).map((wall) => [wall.id, wall]));
  const glazingById = new Map((manifest.glazing ?? []).map((glazing) => [glazing.id, glazing]));
  const glass = (manifest.glazing ?? []).flatMap((glazing) => {
    const wall = wallById.get(glazing.wallId);
    return wall ? [glazingCollider(glazing, wall, options)] : [];
  });
  const curtains = (manifest.curtains ?? []).flatMap((curtain) => {
    const glazing = glazingById.get(curtain.glazingId);
    const wall = glazing && wallById.get(glazing.wallId);
    const room = roomById.get(curtain.roomId);
    return glazing && wall ? [curtainCollider(curtain, glazing, wall, room, options)] : [];
  });

  for (const item of furniture) {
    for (const wall of wallColliders) {
      const result = intersectObb2D(item, wall, options);
      if (!result.intersects || result.relation !== "penetration") continue;
      if (allowedObjectContact(item.metadata.item, wall.ownerId, result, options)) {
        resolvedContacts.push({ a: item.ownerId, b: wall.ownerId, relation: "flush", depthM: result.depthM });
        continue;
      }
      const explicitlyDeclared = (item.metadata.item.allowedContacts ?? []).includes(wall.ownerId);
      issues.push(issue(
        explicitlyDeclared ? "ALLOWED_CONTACT_EXCEEDED" : collisionPairCode(item, wall),
        `${item.ownerId} penetrates ${wall.ownerId} by ${result.depthM.toFixed(3)} m.`,
        [item.ownerId, wall.ownerId],
        { depthM: result.depthM, axis: result.axis, obbIds: [item.id, wall.id] },
      ));
    }
  }

  for (let aIndex = 0; aIndex < furniture.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < furniture.length; bIndex += 1) {
      const a = furniture[aIndex];
      const b = furniture[bIndex];
      if (a.ownerId === b.ownerId) continue;
      const result = intersectObb2D(a, b, options);
      if (result.intersects && result.relation === "penetration") {
        issues.push(issue("FURNITURE_COLLISION", `${a.ownerId} intersects ${b.ownerId} by ${result.depthM.toFixed(3)} m.`, [a.ownerId, b.ownerId], { depthM: result.depthM, axis: result.axis }));
      }
    }
  }

  for (const item of furniture) {
    for (const pane of glass) {
      const result = intersectObb2D(item, pane, options);
      if (!result.intersects || result.relation !== "penetration") continue;
      issues.push(issue("FURNITURE_GLAZING_COLLISION", `${item.ownerId} intersects glazing ${pane.ownerId}.`, [item.ownerId, pane.ownerId], { depthM: result.depthM }));
    }
  }

  for (const fixture of fixtures) {
    for (const wall of wallColliders) {
      const result = intersectObb2D(fixture, wall, options);
      if (result.intersects && result.relation === "penetration") {
        issues.push(issue("FIXTURE_WALL_COLLISION", `${fixture.ownerId} intersects ${wall.ownerId}.`, [fixture.ownerId, wall.ownerId], { depthM: result.depthM }));
      }
    }
    if (fixture.metadata.group.kind !== "pendant") continue;
    for (const item of furniture) {
      const result = intersectObb2D(fixture, item, options);
      if (result.intersects && result.relation === "penetration") issues.push(issue("PENDANT_FURNITURE_COLLISION", `${fixture.ownerId} intersects ${item.ownerId}.`, [fixture.ownerId, item.ownerId]));
    }
  }

  for (const pane of glass) {
    for (const wall of wallColliders) {
      const result = intersectObb2D(pane, wall, options);
      if (!result.intersects || result.relation !== "penetration") continue;
      issues.push(issue("GLAZING_OPAQUE_OVERLAP", `${pane.ownerId} intersects opaque wall ${wall.ownerId}.`, [pane.ownerId, wall.ownerId], { depthM: result.depthM }));
    }
  }
  for (let aIndex = 0; aIndex < glass.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < glass.length; bIndex += 1) {
      const a = glass[aIndex];
      const b = glass[bIndex];
      const result = intersectObb2D(a, b, options);
      if (!result.intersects || result.relation !== "penetration") continue;
      issues.push(issue("GLAZING_DUPLICATE_OVERLAP", `${a.ownerId} and ${b.ownerId} contain overlapping glass surfaces.`, [a.ownerId, b.ownerId], { depthM: result.depthM }));
    }
  }

  for (const curtain of curtains) {
    for (const item of furniture) {
      const result = intersectObb2D(curtain, item, options);
      if (!result.intersects || result.relation !== "penetration") continue;
      if (allowedObjectContact(curtain.metadata.curtain, item.ownerId, result, options)) resolvedContacts.push({ a: curtain.ownerId, b: item.ownerId, relation: "declared", depthM: result.depthM });
      else issues.push(issue((curtain.metadata.curtain.allowedContacts ?? []).includes(item.ownerId) ? "ALLOWED_CONTACT_EXCEEDED" : "CURTAIN_FURNITURE_COLLISION", `${curtain.ownerId} intersects ${item.ownerId}.`, [curtain.ownerId, item.ownerId], { depthM: result.depthM }));
    }
    for (const wall of wallColliders) {
      const result = intersectObb2D(curtain, wall, options);
      if (!result.intersects || result.relation !== "penetration") continue;
      if (allowedObjectContact(curtain.metadata.curtain, wall.ownerId, result, options)) resolvedContacts.push({ a: curtain.ownerId, b: wall.ownerId, relation: "declared", depthM: result.depthM });
      else issues.push(issue((curtain.metadata.curtain.allowedContacts ?? []).includes(wall.ownerId) ? "ALLOWED_CONTACT_EXCEEDED" : "CURTAIN_WALL_COLLISION", `${curtain.ownerId} intersects ${wall.ownerId}.`, [curtain.ownerId, wall.ownerId], { depthM: result.depthM }));
    }
    for (const pane of glass) {
      const result = intersectObb2D(curtain, pane, options);
      if (!result.intersects || result.relation !== "penetration") continue;
      if (allowedObjectContact(curtain.metadata.curtain, pane.ownerId, result, options)) resolvedContacts.push({ a: curtain.ownerId, b: pane.ownerId, relation: "declared", depthM: result.depthM });
      else issues.push(issue((curtain.metadata.curtain.allowedContacts ?? []).includes(pane.ownerId) ? "ALLOWED_CONTACT_EXCEEDED" : "CURTAIN_GLAZING_COLLISION", `${curtain.ownerId} intersects glazing ${pane.ownerId}.`, [curtain.ownerId, pane.ownerId], { depthM: result.depthM }));
    }
  }
  for (let aIndex = 0; aIndex < curtains.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < curtains.length; bIndex += 1) {
      const a = curtains[aIndex];
      const b = curtains[bIndex];
      const result = intersectObb2D(a, b, options);
      if (result.intersects && result.relation === "penetration") issues.push(issue("CURTAIN_COLLISION", `${a.ownerId} intersects ${b.ownerId}.`, [a.ownerId, b.ownerId], { depthM: result.depthM }));
    }
  }

  const doorSweeps = buildDoorSweeps(manifest, options);
  for (const sweep of doorSweeps) {
    for (const item of furniture) {
      if (item.center[1] - item.half[1] >= sweep.top || item.center[1] + item.half[1] <= sweep.bottom) continue;
      if (polygonsInteriorOverlap(sweep.polygon, obbFootprint(item), options.epsilon)) issues.push(issue("DOOR_SWEEP_COLLISION", `${sweep.doorId} swing intersects ${item.ownerId}.`, [sweep.doorId, item.ownerId], { sweepId: sweep.id, polygon: sweep.polygon }));
    }
    for (const wall of wallColliders) {
      if (wall.ownerId === sweep.wallId) continue;
      const wallMinY = wall.center[1] - wall.half[1];
      const wallMaxY = wall.center[1] + wall.half[1];
      if (wallMinY >= sweep.top || wallMaxY <= sweep.bottom) continue;
      if (polygonsInteriorOverlap(sweep.polygon, obbFootprint(wall), options.epsilon)) issues.push(issue("DOOR_SWEEP_WALL_COLLISION", `${sweep.doorId} swing intersects ${wall.ownerId}.`, [sweep.doorId, wall.ownerId], { sweepId: sweep.id, polygon: sweep.polygon }));
    }
  }
  for (let aIndex = 0; aIndex < doorSweeps.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < doorSweeps.length; bIndex += 1) {
      const a = doorSweeps[aIndex];
      const b = doorSweeps[bIndex];
      if (a.doorId === b.doorId) continue;
      if (polygonsInteriorOverlap(a.polygon, b.polygon, options.epsilon)) issues.push(issue("DOOR_SWEEP_OVERLAP", `${a.doorId} and ${b.doorId} swing envelopes overlap.`, [a.doorId, b.doorId], { sweepIds: [a.id, b.id] }));
    }
  }

  const uniqueIssues = [];
  const seen = new Set();
  for (const item of issues) {
    const key = `${item.code}:${[...(item.entityIds ?? [])].sort().join("|")}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueIssues.push(item);
    }
  }
  return {
    issues: uniqueIssues,
    unresolvedCollisions: uniqueIssues.length,
    provisionalCollisionWarnings: 0,
    resolvedContacts,
    debug: { wallColliders, furniture, fixtures, glass, curtains, doorSweeps },
  };
}

/**
 * Replays the required construction order against progressively richer
 * manifest slices. The final stage is identical to the production collision
 * report; earlier stages make regressions attributable to a single layer.
 */
export function validateCollisionStages(manifest, overrides = {}) {
  const base = {
    rooms: manifest.rooms ?? [],
    walls: manifest.walls ?? [],
    devices: manifest.devices ?? [],
  };
  const stages = [
    { id: "architecture", manifest: { ...base, doors: [], glazing: [], openPassages: [], furniture: [], lights: [], curtains: [] } },
    { id: "openings", manifest: { ...base, doors: manifest.doors ?? [], glazing: [], openPassages: manifest.openPassages ?? [], furniture: [], lights: [], curtains: [] } },
    { id: "glazing", manifest: { ...base, doors: manifest.doors ?? [], glazing: manifest.glazing ?? [], openPassages: manifest.openPassages ?? [], furniture: [], lights: [], curtains: [] } },
    { id: "furniture", manifest: { ...base, doors: manifest.doors ?? [], glazing: manifest.glazing ?? [], openPassages: manifest.openPassages ?? [], furniture: manifest.furniture ?? [], lights: [], curtains: [] } },
    { id: "lighting", manifest: { ...base, doors: manifest.doors ?? [], glazing: manifest.glazing ?? [], openPassages: manifest.openPassages ?? [], furniture: manifest.furniture ?? [], lights: manifest.lights ?? [], curtains: [] } },
    { id: "curtains", manifest },
  ];
  return stages.map((stage) => ({ id: stage.id, ...validateManifestCollisions(stage.manifest, overrides) }));
}
