import * as THREE from "three";
import { roundedBox } from "./sceneUtils.js";

const MIN_PART = 0.012;
const ENRICHED_FURNITURE_KINDS = new Set([
  "bathtub",
  "cabinet",
  "coffee-table",
  "fireplace",
  "island",
  "kitchen",
  "sectional-sofa",
  "shower",
  "sofa",
  "vanity",
]);

function materialFrom(materials, ...ids) {
  for (const id of ids) {
    const material = materials.get(id);
    if (material) return material;
  }
  return new THREE.MeshStandardMaterial({ color: "#77716a", roughness: 0.8 });
}

function addBox(group, size, position, material, radius = 0.025) {
  const safeSize = size.map((value) => Math.max(MIN_PART, value));
  const mesh = roundedBox(safeSize[0], safeSize[1], safeSize[2], material, radius);
  mesh.position.set(position[0], position[1], position[2]);
  group.add(mesh);
  return mesh;
}

function addCylinder(group, radius, height, position, material, segments = 36) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(Math.max(MIN_PART, radius), Math.max(MIN_PART, radius), Math.max(MIN_PART, height), segments),
    material,
  );
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function namePart(part, name) {
  part.name = name;
  return part;
}

function addFaucet(group, {
  x = 0,
  z = 0,
  baseY,
  maxY,
  reach,
  material,
  name = "faucet",
  direction = 1,
}) {
  const availableHeight = Math.max(MIN_PART * 2, maxY - baseY);
  const thickness = Math.max(MIN_PART, Math.min(0.028, availableHeight * 0.16, reach * 0.18));
  const riserHeight = Math.max(MIN_PART, availableHeight - thickness * 0.75);
  namePart(
    addBox(
      group,
      [thickness, riserHeight, thickness],
      [x, baseY + riserHeight / 2, z],
      material,
      thickness * 0.32,
    ),
    `${name}-riser`,
  );
  namePart(
    addBox(
      group,
      [thickness, thickness, reach],
      [x, baseY + riserHeight - thickness / 2, z + direction * reach / 2],
      material,
      thickness * 0.32,
    ),
    `${name}-spout`,
  );
  namePart(
    addBox(
      group,
      [thickness * 0.72, thickness * 1.45, thickness * 0.72],
      [x, baseY + riserHeight - thickness * 1.18, z + direction * (reach - thickness * 0.36)],
      material,
      thickness * 0.24,
    ),
    `${name}-aerator`,
  );
}

function assertWithinEnvelope(group, [width, height, depth], furnitureId) {
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group, true);
  const epsilon = 1e-5;
  const outside = bounds.min.x < -width / 2 - epsilon
    || bounds.max.x > width / 2 + epsilon
    || bounds.min.y < -epsilon
    || bounds.max.y > height + epsilon
    || bounds.min.z < -depth / 2 - epsilon
    || bounds.max.z > depth / 2 + epsilon;
  if (!outside) return;
  throw new Error(
    `Furniture proxy ${furnitureId} exceeds its local envelope: `
      + `[${bounds.min.toArray().join(", ")}]–[${bounds.max.toArray().join(", ")}] `
      + `outside [${-width / 2}, 0, ${-depth / 2}]–[${width / 2}, ${height}, ${depth / 2}]`,
  );
}

function addBed(group, [width, height, depth], palette) {
  const headDepth = Math.min(0.16, depth * 0.09);
  const frameHeight = Math.min(height * 0.28, 0.3);
  const mattressHeight = Math.min(height * 0.22, 0.24);

  addBox(group, [width * 0.98, frameHeight, depth * 0.94], [0, frameHeight / 2, depth * 0.025], palette.dark, 0.055);
  addBox(
    group,
    [width * 0.92, mattressHeight, depth * 0.78],
    [0, frameHeight + mattressHeight / 2, depth * 0.07],
    palette.primary,
    0.075,
  );
  addBox(group, [width, height, headDepth], [0, height / 2, -depth / 2 + headDepth / 2], palette.dark, 0.035);

  const pillowWidth = width * 0.38;
  const pillowY = frameHeight + mattressHeight + Math.min(0.08, height * 0.08);
  [-1, 1].forEach((side) => {
    addBox(
      group,
      [pillowWidth, Math.min(0.13, height * 0.12), depth * 0.2],
      [side * width * 0.22, pillowY, -depth * 0.2],
      palette.textile,
      0.065,
    );
  });
}

function addBench(group, [width, height, depth], palette) {
  const cushionHeight = Math.min(0.16, height * 0.38);
  const leg = Math.min(0.08, width * 0.07, depth * 0.14);
  const legHeight = Math.max(0.08, height - cushionHeight);
  addBox(group, [width, cushionHeight, depth], [0, height - cushionHeight / 2, 0], palette.primary, 0.055);
  [-1, 1].forEach((xSide) => [-1, 1].forEach((zSide) => {
    addBox(
      group,
      [leg, legHeight, leg],
      [xSide * (width / 2 - leg), legHeight / 2, zSide * (depth / 2 - leg)],
      palette.dark,
      0.012,
    );
  }));
}

function createChair([width, height, depth], palette) {
  const chair = new THREE.Group();
  const leg = Math.max(0.025, Math.min(0.045, width * 0.09));
  const seatHeight = Math.min(height * 0.53, 0.48);
  const seatThickness = Math.max(0.06, Math.min(0.11, height * 0.13));
  const backDepth = Math.max(0.045, Math.min(0.1, depth * 0.13));
  addBox(chair, [width * 0.9, seatThickness, depth * 0.78], [0, seatHeight, 0], palette.primary, 0.045);
  addBox(
    chair,
    [width, Math.max(0.12, height - seatHeight), backDepth],
    [0, (height + seatHeight) / 2, -depth / 2 + backDepth / 2],
    palette.primary,
    0.05,
  );
  [-1, 1].forEach((xSide) => [-1, 1].forEach((zSide) => {
    addBox(
      chair,
      [leg, seatHeight, leg],
      [xSide * (width * 0.4), seatHeight / 2, zSide * (depth * 0.34)],
      palette.dark,
      0.008,
    );
  }));
  return chair;
}

function addCabinet(group, [width, height, depth], palette) {
  const plinthHeight = Math.min(0.12, Math.max(0.055, height * 0.04));
  const handleDepth = Math.min(0.022, Math.max(MIN_PART, depth * 0.04));
  const faceDepth = Math.min(0.026, Math.max(MIN_PART, depth * 0.05));
  const carcassDepth = Math.max(MIN_PART, depth - faceDepth - handleDepth);
  const bodyHeight = height - plinthHeight;

  namePart(
    addBox(
      group,
      [width * 0.88, plinthHeight, depth * 0.72],
      [0, plinthHeight / 2, -depth * 0.055],
      palette.dark,
      0.012,
    ),
    "cabinet-recessed-plinth",
  );
  namePart(
    addBox(
      group,
      [width, bodyHeight, carcassDepth],
      [0, plinthHeight + bodyHeight / 2, -(faceDepth + handleDepth) / 2],
      palette.primary,
      0.018,
    ),
    "cabinet-carcass",
  );

  const panelCount = Math.max(1, Math.round(width / 0.72));
  const panelBay = width / panelCount;
  const gap = Math.min(0.018, panelBay * 0.035);
  const panelWidth = Math.max(MIN_PART, panelBay - gap);
  const panelHeight = Math.max(MIN_PART, bodyHeight - gap * 2);
  const panelZ = depth / 2 - handleDepth - faceDepth / 2;
  const handleWidth = Math.min(0.026, Math.max(MIN_PART, panelWidth * 0.055));
  const handleHeight = Math.min(0.22, Math.max(0.09, bodyHeight * 0.075));

  for (let index = 0; index < panelCount; index += 1) {
    const x = -width / 2 + panelBay * (index + 0.5);
    namePart(
      addBox(
        group,
        [panelWidth, panelHeight, faceDepth],
        [x, plinthHeight + bodyHeight / 2, panelZ],
        palette.primary,
        Math.min(0.008, gap * 0.4),
      ),
      `cabinet-facade-${index + 1}`,
    );
    namePart(
      addBox(
        group,
        [handleWidth, handleHeight, handleDepth],
        [x + panelWidth * 0.32, height * 0.5, depth / 2 - handleDepth / 2],
        palette.metal,
        handleWidth * 0.28,
      ),
      `cabinet-handle-${index + 1}`,
    );
  }
}

function addBathtub(group, [width, height, depth], palette) {
  const tubHeight = height * 0.72;
  namePart(
    addBox(
      group,
      [width, tubHeight, depth],
      [0, tubHeight / 2, 0],
      palette.primary,
      Math.min(0.12, depth * 0.18),
    ),
    "bathtub-shell",
  );
  const well = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.46, 0.018, 48),
    palette.dark,
  );
  well.scale.set(width * 0.72, 1, depth * 0.62);
  well.position.y = tubHeight - 0.014;
  well.castShadow = false;
  well.name = "bathtub-well";
  group.add(well);

  const faucetX = width * 0.27;
  const faucetZ = -depth / 2 + Math.min(0.13, depth * 0.17);
  addFaucet(group, {
    x: faucetX,
    z: faucetZ,
    baseY: tubHeight,
    maxY: height - MIN_PART,
    reach: Math.min(0.18, depth * 0.24),
    material: palette.metal,
    name: "bathtub-faucet",
  });
  namePart(
    addBox(
      group,
      [Math.min(0.06, width * 0.035), Math.min(0.035, height * 0.06), Math.min(0.06, depth * 0.08)],
      [faucetX + Math.min(0.09, width * 0.075), tubHeight + Math.min(0.035, (height - tubHeight) * 0.24) / 2, faucetZ],
      palette.metal,
      0.008,
    ),
    "bathtub-mixer-control",
  );
}

function addVanity(group, [width, height, depth], palette) {
  const counterY = height * 0.58;
  const topHeight = Math.min(0.065, height * 0.09);
  const cabinetHeight = counterY - topHeight;
  namePart(
    addBox(
      group,
      [width * 0.94, cabinetHeight, depth * 0.9],
      [0, cabinetHeight / 2, 0],
      palette.dark,
      0.024,
    ),
    "vanity-cabinet",
  );
  namePart(
    addBox(group, [width, topHeight, depth], [0, counterY - topHeight / 2, 0], palette.primary, 0.018),
    "vanity-countertop",
  );
  const basin = addCylinder(
    group,
    Math.min(width, depth) * 0.21,
    MIN_PART,
    [0, counterY - MIN_PART / 2, depth * 0.06],
    palette.ceramic,
    32,
  );
  basin.scale.z = 0.68;
  basin.name = "vanity-basin";

  const mirrorGap = Math.min(0.055, height * 0.065);
  const mirrorBottom = counterY + mirrorGap;
  const mirrorHeight = Math.max(MIN_PART, height - mirrorBottom);
  const mirrorWidth = width * 0.78;
  const frame = Math.min(0.025, Math.max(MIN_PART, mirrorWidth * 0.035));
  const mirrorDepth = Math.min(0.02, Math.max(MIN_PART, depth * 0.025));
  const mirrorZ = -depth / 2 + mirrorDepth / 2;
  namePart(
    addBox(
      group,
      [Math.max(MIN_PART, mirrorWidth - frame * 2), Math.max(MIN_PART, mirrorHeight - frame * 2), mirrorDepth],
      [0, mirrorBottom + mirrorHeight / 2, mirrorZ],
      palette.glass,
      0.006,
    ),
    "vanity-mirror",
  );
  [-1, 1].forEach((side) => {
    namePart(
      addBox(
        group,
        [frame, mirrorHeight, mirrorDepth],
        [side * (mirrorWidth / 2 - frame / 2), mirrorBottom + mirrorHeight / 2, mirrorZ],
        palette.metal,
        0.004,
      ),
      `vanity-mirror-frame-${side > 0 ? "right" : "left"}`,
    );
  });
  [mirrorBottom + frame / 2, height - frame / 2].forEach((y, index) => {
    namePart(
      addBox(group, [mirrorWidth, frame, mirrorDepth], [0, y, mirrorZ], palette.metal, 0.004),
      `vanity-mirror-frame-${index ? "top" : "bottom"}`,
    );
  });

  addFaucet(group, {
    x: 0,
    z: -depth * 0.12,
    baseY: counterY,
    maxY: Math.min(mirrorBottom - MIN_PART, counterY + height * 0.2),
    reach: Math.min(0.14, depth * 0.24),
    material: palette.metal,
    name: "vanity-faucet",
  });
}

function addShower(group, [width, height, depth], palette) {
  const pane = Math.min(0.018, width * 0.02, depth * 0.02);
  const baseHeight = Math.min(0.055, height * 0.04);
  namePart(
    addBox(group, [width, baseHeight, depth], [0, baseHeight / 2, 0], palette.ceramic, 0.015),
    "shower-tray",
  );
  const back = addBox(group, [width, height, pane], [0, height / 2, -depth / 2 + pane / 2], palette.glass, 0);
  const side = addBox(group, [pane, height, depth], [-width / 2 + pane / 2, height / 2, 0], palette.glass, 0);
  const doorWidth = width * 0.56;
  const doorCenterX = width * 0.18;
  const door = addBox(
    group,
    [doorWidth, height - baseHeight, pane],
    [doorCenterX, baseHeight + (height - baseHeight) / 2, depth / 2 - pane / 2],
    palette.glass,
    0,
  );
  back.castShadow = false;
  side.castShadow = false;
  door.castShadow = false;
  back.name = "shower-back-glass";
  side.name = "shower-side-glass";
  door.name = "shower-door-glass";

  const rail = Math.min(0.035, Math.max(MIN_PART, Math.min(width, depth) * 0.035));
  const doorLeft = doorCenterX - doorWidth / 2;
  const doorRight = doorCenterX + doorWidth / 2;
  [doorLeft, doorRight].forEach((x, index) => {
    namePart(
      addBox(
        group,
        [rail, height - baseHeight, rail],
        [x, baseHeight + (height - baseHeight) / 2, depth / 2 - rail / 2],
        palette.metal,
        0.003,
      ),
      `shower-door-profile-${index ? "right" : "left"}`,
    );
  });
  namePart(
    addBox(
      group,
      [doorWidth + rail, rail, rail],
      [doorCenterX, height - rail / 2, depth / 2 - rail / 2],
      palette.metal,
      0.003,
    ),
    "shower-door-profile-top",
  );

  const riserX = width * 0.24;
  const riserZ = -depth / 2 + pane + rail;
  const riserBottom = Math.max(baseHeight + 0.3, height * 0.22);
  const riserTop = height * 0.86;
  namePart(
    addBox(
      group,
      [rail, riserTop - riserBottom, rail],
      [riserX, (riserBottom + riserTop) / 2, riserZ],
      palette.metal,
      rail * 0.35,
    ),
    "shower-riser",
  );
  namePart(
    addBox(
      group,
      [rail, rail, Math.min(0.18, depth * 0.28)],
      [riserX, riserTop, riserZ + Math.min(0.18, depth * 0.28) / 2],
      palette.metal,
      rail * 0.35,
    ),
    "shower-head-arm",
  );
  namePart(
    addCylinder(
      group,
      Math.min(0.075, width * 0.07),
      rail,
      [riserX, riserTop - rail / 2, riserZ + Math.min(0.18, depth * 0.28)],
      palette.metal,
      32,
    ),
    "shower-head",
  );
  namePart(
    addBox(
      group,
      [Math.min(0.18, width * 0.22), Math.min(0.12, height * 0.06), rail],
      [riserX, height * 0.42, riserZ],
      palette.metal,
      0.012,
    ),
    "shower-mixer",
  );
}

function addSofa(group, [width, height, depth], palette) {
  const armWidth = Math.min(0.22, width * 0.12);
  const backDepth = Math.min(0.2, depth * 0.2);
  const legHeight = Math.min(0.11, height * 0.14);
  const legSize = Math.min(0.07, width * 0.045, depth * 0.07);
  const baseHeight = height * 0.24;
  const seatHeight = height * 0.18;
  const baseTop = legHeight + baseHeight;
  const seatDepth = Math.max(MIN_PART, depth - backDepth - depth * 0.12);
  const seatCenterZ = (-depth / 2 + backDepth + depth / 2 - depth * 0.04) / 2;

  namePart(
    addBox(
      group,
      [width, baseHeight, depth * 0.78],
      [0, legHeight + baseHeight / 2, depth * 0.05],
      palette.dark,
      0.075,
    ),
    "sofa-base",
  );
  namePart(
    addBox(
      group,
      [width, height - baseTop, backDepth],
      [0, baseTop + (height - baseTop) / 2, -depth / 2 + backDepth / 2],
      palette.primary,
      0.075,
    ),
    "sofa-back",
  );

  const usableWidth = width - armWidth * 2;
  const cushionCount = Math.max(2, Math.round(usableWidth / 0.72));
  const cushionGap = Math.min(0.022, usableWidth * 0.018);
  const cushionWidth = (usableWidth - cushionGap * (cushionCount - 1)) / cushionCount;
  for (let index = 0; index < cushionCount; index += 1) {
    const x = -usableWidth / 2 + cushionWidth / 2 + index * (cushionWidth + cushionGap);
    namePart(
      addBox(
        group,
        [cushionWidth, seatHeight, seatDepth],
        [x, baseTop + seatHeight / 2, seatCenterZ],
        palette.primary,
        0.075,
      ),
      `sofa-seat-cushion-${index + 1}`,
    );
  }

  [-1, 1].forEach((side) => {
    namePart(
      addBox(
        group,
        [armWidth, height * 0.62, depth],
        [side * (width / 2 - armWidth / 2), legHeight + height * 0.31, 0],
        palette.primary,
        0.075,
      ),
      `sofa-arm-${side > 0 ? "right" : "left"}`,
    );
  });
  [-1, 1].forEach((xSide) => [-1, 1].forEach((zSide) => {
    namePart(
      addBox(
        group,
        [legSize, legHeight, legSize],
        [xSide * (width / 2 - armWidth * 0.72), legHeight / 2, zSide * (depth * 0.31)],
        palette.metal,
        0.006,
      ),
      `sofa-leg-${xSide > 0 ? "r" : "l"}-${zSide > 0 ? "front" : "back"}`,
    );
  }));
}

function addRoundTable(group, [width, height, depth], palette) {
  const topHeight = Math.min(0.085, height * 0.14);
  const top = addCylinder(group, 0.5, topHeight, [0, height - topHeight / 2, 0], palette.primary, 48);
  top.scale.set(width, 1, depth);
  addCylinder(group, Math.min(width, depth) * 0.09, height - topHeight, [0, (height - topHeight) / 2, 0], palette.dark, 28);
  const foot = addCylinder(group, 0.5, Math.min(0.045, height * 0.08), [0, Math.min(0.045, height * 0.08) / 2, 0], palette.dark, 36);
  foot.scale.set(width * 0.34, 1, depth * 0.34);
}

function addChairRing(group, definition, palette) {
  const [width, height, depth] = definition.size;
  const count = Math.max(3, definition.count ?? 8);
  const chairWidth = Math.min(0.48, width * 0.18);
  const chairDepth = Math.min(0.54, depth * 0.2);
  const radiusX = Math.max(0.1, width / 2 - Math.hypot(chairWidth, chairDepth) / 2);
  const radiusZ = Math.max(0.1, depth / 2 - Math.hypot(chairWidth, chairDepth) / 2);
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const chair = createChair([chairWidth, height, chairDepth], palette);
    chair.position.set(Math.sin(angle) * radiusX, 0, Math.cos(angle) * radiusZ);
    chair.rotation.y = angle + Math.PI;
    group.add(chair);
  }
}

function addIsland(group, [width, height, depth], palette) {
  const topHeight = Math.min(0.075, height * 0.1);
  const faucetHeadroom = Math.min(0.19, Math.max(0.13, height * 0.2));
  const counterY = height - faucetHeadroom;
  const bodyHeight = counterY - topHeight;
  namePart(
    addBox(
      group,
      [width * 0.88, bodyHeight, depth * 0.8],
      [0, bodyHeight / 2, -depth * 0.025],
      palette.dark,
      0.025,
    ),
    "island-base",
  );
  namePart(
    addBox(group, [width, topHeight, depth], [0, counterY - topHeight / 2, 0], palette.primary, 0.02),
    "island-overhang-countertop",
  );

  const sinkWidth = Math.min(0.68, width * 0.34);
  const sinkDepth = Math.min(0.42, depth * 0.38);
  const sinkX = -width * 0.18;
  namePart(
    addBox(
      group,
      [sinkWidth, MIN_PART, sinkDepth],
      [sinkX, counterY - MIN_PART / 2, 0],
      palette.dark,
      0.035,
    ),
    "island-sink-recess",
  );
  addFaucet(group, {
    x: sinkX + sinkWidth * 0.32,
    z: -sinkDepth * 0.42,
    baseY: counterY,
    maxY: height - MIN_PART,
    reach: Math.min(0.16, sinkDepth * 0.48),
    material: palette.metal,
    name: "island-faucet",
  });
}

function addStoolRow(group, definition, palette) {
  const [width, height, depth] = definition.size;
  const count = Math.max(1, definition.count ?? 3);
  const stoolWidth = Math.min(0.42, (width / count) * 0.68);
  const spacing = count === 1 ? 0 : (width - stoolWidth) / (count - 1);
  for (let index = 0; index < count; index += 1) {
    const x = count === 1 ? 0 : -width / 2 + stoolWidth / 2 + index * spacing;
    const stool = createChair([stoolWidth, height, depth], palette);
    stool.position.x = x;
    group.add(stool);
  }
}

function addKitchen(group, [width, height, depth], palette) {
  const counterHeight = Math.min(0.92, height * 0.32);
  const topHeight = Math.min(0.06, height * 0.025);
  const tallWidth = Math.min(width * 0.28, 1.25);
  const gap = Math.min(0.035, width * 0.008);
  const centerWidth = Math.max(MIN_PART, width - tallWidth * 2 - gap * 2);
  const handleDepth = Math.min(0.022, Math.max(MIN_PART, depth * 0.035));
  const faceDepth = Math.min(0.022, Math.max(MIN_PART, depth * 0.035));
  const carcassDepth = Math.max(MIN_PART, depth - handleDepth - faceDepth);
  const carcassZ = -(handleDepth + faceDepth) / 2;

  namePart(
    addBox(
      group,
      [centerWidth, counterHeight - topHeight, carcassDepth],
      [0, (counterHeight - topHeight) / 2, carcassZ],
      palette.dark,
      0.012,
    ),
    "kitchen-lower-carcass",
  );
  namePart(
    addBox(
      group,
      [centerWidth + gap * 2, topHeight, depth],
      [0, counterHeight - topHeight / 2, 0],
      palette.primary,
      0.008,
    ),
    "kitchen-countertop",
  );

  [-1, 1].forEach((side) => {
    const x = side * (width / 2 - tallWidth / 2);
    namePart(
      addBox(group, [tallWidth, height, carcassDepth], [x, height / 2, carcassZ], palette.dark, 0.012),
      `kitchen-tall-carcass-${side > 0 ? "right" : "left"}`,
    );
    namePart(
      addBox(
        group,
        [tallWidth - gap, height - gap * 2, faceDepth],
        [x, height / 2, depth / 2 - handleDepth - faceDepth / 2],
        palette.primary,
        0.008,
      ),
      `kitchen-tall-facade-${side > 0 ? "right" : "left"}`,
    );
    namePart(
      addBox(
        group,
        [Math.min(0.025, tallWidth * 0.035), Math.min(0.42, height * 0.18), handleDepth],
        [x - side * tallWidth * 0.32, height * 0.48, depth / 2 - handleDepth / 2],
        palette.metal,
        0.005,
      ),
      `kitchen-tall-handle-${side > 0 ? "right" : "left"}`,
    );
  });

  const panelCount = Math.max(3, Math.round(centerWidth / 0.66));
  const panelBay = centerWidth / panelCount;
  const panelWidth = Math.max(MIN_PART, panelBay - gap);
  for (let index = 0; index < panelCount; index += 1) {
    const x = -centerWidth / 2 + panelBay * (index + 0.5);
    namePart(
      addBox(
        group,
        [panelWidth, counterHeight - topHeight - gap, faceDepth],
        [x, (counterHeight - topHeight) / 2, depth / 2 - handleDepth - faceDepth / 2],
        palette.dark,
        0.006,
      ),
      `kitchen-lower-facade-${index + 1}`,
    );
    namePart(
      addBox(
        group,
        [panelWidth * 0.52, Math.min(0.02, counterHeight * 0.025), handleDepth],
        [x, counterHeight * 0.68, depth / 2 - handleDepth / 2],
        palette.metal,
        0.004,
      ),
      `kitchen-lower-rail-${index + 1}`,
    );
  }

  const sinkX = -centerWidth * 0.25;
  const applianceX = centerWidth * 0.24;
  const sinkWidth = Math.min(0.64, centerWidth * 0.28);
  const sinkDepth = Math.min(0.38, depth * 0.58);
  namePart(
    addBox(
      group,
      [sinkWidth, MIN_PART, sinkDepth],
      [sinkX, counterHeight - MIN_PART / 2, 0],
      palette.dark,
      0.03,
    ),
    "kitchen-sink-recess",
  );
  namePart(
    addBox(
      group,
      [Math.min(0.68, centerWidth * 0.3), MIN_PART, depth * 0.5],
      [applianceX, counterHeight - MIN_PART / 2, 0],
      palette.trim,
      0.012,
    ),
    "kitchen-cooktop",
  );
  addFaucet(group, {
    x: sinkX + sinkWidth * 0.34,
    z: -sinkDepth * 0.42,
    baseY: counterHeight,
    maxY: Math.min(height - MIN_PART, counterHeight + 0.38),
    reach: Math.min(0.16, sinkDepth * 0.5),
    material: palette.metal,
    name: "kitchen-faucet",
  });

  const upperBottom = counterHeight + Math.min(0.58, height * 0.2);
  const upperHeight = Math.max(0.25, height - upperBottom);
  const hoodWidth = Math.min(0.78, centerWidth * 0.3);
  const hoodLeft = applianceX - hoodWidth / 2;
  const hoodRight = applianceX + hoodWidth / 2;
  const innerLeft = -centerWidth / 2;
  const innerRight = centerWidth / 2;
  const leftUpperWidth = Math.max(0, hoodLeft - innerLeft - gap);
  const rightUpperWidth = Math.max(0, innerRight - hoodRight - gap);
  [
    { width: leftUpperWidth, x: innerLeft + leftUpperWidth / 2 },
    { width: rightUpperWidth, x: hoodRight + gap + rightUpperWidth / 2 },
  ].forEach((upper, index) => {
    if (upper.width < MIN_PART * 2) return;
    namePart(
      addBox(
        group,
        [upper.width, upperHeight, depth * 0.52],
        [upper.x, upperBottom + upperHeight / 2, -depth * 0.24],
        palette.primary,
        0.012,
      ),
      `kitchen-upper-cabinet-${index + 1}`,
    );
    namePart(
      addBox(
        group,
        [Math.min(0.24, upper.width * 0.34), 0.018, handleDepth],
        [upper.x, upperBottom + upperHeight * 0.16, depth * 0.02],
        palette.metal,
        0.004,
      ),
      `kitchen-upper-rail-${index + 1}`,
    );
  });

  const canopyHeight = Math.min(0.18, height * 0.06);
  const canopyY = upperBottom + upperHeight * 0.25;
  namePart(
    addBox(
      group,
      [hoodWidth, canopyHeight, depth * 0.68],
      [applianceX, canopyY, depth * 0.04],
      palette.metal,
      0.012,
    ),
    "kitchen-hood-canopy",
  );
  namePart(
    addBox(
      group,
      [hoodWidth * 0.42, Math.max(MIN_PART, height - canopyY - canopyHeight / 2), depth * 0.28],
      [applianceX, canopyY + canopyHeight / 2 + Math.max(MIN_PART, height - canopyY - canopyHeight / 2) / 2, -depth * 0.24],
      palette.metal,
      0.008,
    ),
    "kitchen-hood-flue",
  );
}

function addSectionalSofa(group, [width, height, depth], palette) {
  const mainDepth = Math.min(depth, Math.max(0.82, depth * 0.38));
  const returnWidth = Math.min(width * 0.28, 1.15);
  const returnDepth = Math.max(MIN_PART, depth - mainDepth);
  const returnStartX = width / 2 - returnWidth;
  const mainStartZ = depth / 2 - mainDepth;
  const legHeight = Math.min(0.1, height * 0.13);
  const legSize = Math.min(0.075, width * 0.025, depth * 0.035);
  const baseHeight = height * 0.23;
  const baseTop = legHeight + baseHeight;
  const seatHeight = height * 0.18;
  const backDepth = Math.min(0.2, mainDepth * 0.22);
  namePart(
    addBox(
      group,
      [width, baseHeight, mainDepth],
      [0, legHeight + baseHeight / 2, depth / 2 - mainDepth / 2],
      palette.dark,
      0.075,
    ),
    "sectional-main-base",
  );
  namePart(
    addBox(
      group,
      [returnWidth, baseHeight, returnDepth],
      [width / 2 - returnWidth / 2, legHeight + baseHeight / 2, -mainDepth / 2],
      palette.dark,
      0.075,
    ),
    "sectional-return-base",
  );
  namePart(
    addBox(
      group,
      [width, height - baseTop, backDepth],
      [0, baseTop + (height - baseTop) / 2, depth / 2 - backDepth / 2],
      palette.primary,
      0.07,
    ),
    "sectional-main-back",
  );
  namePart(
    addBox(
      group,
      [backDepth, height - baseTop, returnDepth],
      [width / 2 - backDepth / 2, baseTop + (height - baseTop) / 2, -mainDepth / 2],
      palette.primary,
      0.07,
    ),
    "sectional-return-back",
  );

  const mainArmWidth = Math.min(0.22, width * 0.06);
  const mainSeatWidth = Math.max(MIN_PART, returnStartX - (-width / 2 + mainArmWidth));
  const mainSeatDepth = Math.max(MIN_PART, mainDepth - backDepth - 0.07);
  const mainCushionCount = Math.max(2, Math.round(mainSeatWidth / 0.82));
  const gap = Math.min(0.022, mainSeatWidth * 0.008);
  const mainCushionWidth = (mainSeatWidth - gap * (mainCushionCount - 1)) / mainCushionCount;
  for (let index = 0; index < mainCushionCount; index += 1) {
    const x = -width / 2 + mainArmWidth + mainCushionWidth / 2 + index * (mainCushionWidth + gap);
    namePart(
      addBox(
        group,
        [mainCushionWidth, seatHeight, mainSeatDepth],
        [x, baseTop + seatHeight / 2, mainStartZ + mainSeatDepth / 2],
        palette.primary,
        0.075,
      ),
      `sectional-main-cushion-${index + 1}`,
    );
  }

  const returnSeatWidth = Math.max(MIN_PART, returnWidth - backDepth - 0.07);
  const returnSeatDepth = Math.max(MIN_PART, returnDepth - mainArmWidth);
  const returnCushionCount = Math.max(2, Math.round(returnSeatDepth / 0.8));
  const returnCushionDepth = (returnSeatDepth - gap * (returnCushionCount - 1)) / returnCushionCount;
  for (let index = 0; index < returnCushionCount; index += 1) {
    const z = -depth / 2 + mainArmWidth + returnCushionDepth / 2 + index * (returnCushionDepth + gap);
    namePart(
      addBox(
        group,
        [returnSeatWidth, seatHeight, returnCushionDepth],
        [returnStartX + returnSeatWidth / 2, baseTop + seatHeight / 2, z],
        palette.primary,
        0.075,
      ),
      `sectional-return-cushion-${index + 1}`,
    );
  }

  namePart(
    addBox(
      group,
      [mainArmWidth, height * 0.58, mainDepth],
      [-width / 2 + mainArmWidth / 2, legHeight + height * 0.29, depth / 2 - mainDepth / 2],
      palette.primary,
      0.07,
    ),
    "sectional-left-arm",
  );
  namePart(
    addBox(
      group,
      [returnWidth, height * 0.58, mainArmWidth],
      [width / 2 - returnWidth / 2, legHeight + height * 0.29, -depth / 2 + mainArmWidth / 2],
      palette.primary,
      0.07,
    ),
    "sectional-return-arm",
  );

  const legPositions = [
    [-width / 2 + mainArmWidth * 0.72, mainStartZ + legSize],
    [-width / 2 + mainArmWidth * 0.72, depth / 2 - legSize],
    [returnStartX - legSize, mainStartZ + legSize],
    [width / 2 - legSize, depth / 2 - legSize],
    [returnStartX + legSize, -depth / 2 + legSize],
    [width / 2 - legSize, -depth / 2 + legSize],
  ];
  legPositions.forEach(([x, z], index) => {
    namePart(
      addBox(group, [legSize, legHeight, legSize], [x, legHeight / 2, z], palette.metal, 0.006),
      `sectional-leg-${index + 1}`,
    );
  });
}

function addCoffeeTable(group, [width, height, depth], palette) {
  const topHeight = Math.min(0.075, height * 0.22);
  const baseHeight = height - topHeight;
  const table = namePart(
    addCylinder(group, 0.5, topHeight, [0, height - topHeight / 2, 0], palette.primary, 48),
    "coffee-table-overhang-top",
  );
  table.scale.set(width, 1, depth);

  [-1, 1].forEach((side) => {
    const pedestal = namePart(
      addCylinder(
        group,
        0.5,
        baseHeight,
        [side * width * 0.22, baseHeight / 2, 0],
        palette.dark,
        40,
      ),
      `coffee-table-pedestal-${side > 0 ? "right" : "left"}`,
    );
    pedestal.scale.set(width * 0.34, 1, depth * 0.52);
  });
}

function addFireplace(group, [width, height, depth], palette) {
  const portalDepth = depth * 0.44;
  const rearDepth = depth - portalDepth;
  const openingWidth = width * 0.66;
  const openingHeight = height * 0.46;
  const openingBottom = height * 0.08;
  const openingTop = openingBottom + openingHeight;
  const recessDepth = Math.min(0.018, depth * 0.05);
  const recessZ = depth / 2 - portalDepth + recessDepth / 2;
  const jambWidth = (width - openingWidth) / 2;
  const lintelHeight = Math.min(0.13, height * 0.11);
  const mantelHeight = Math.min(0.1, height * 0.08);

  namePart(
    addBox(
      group,
      [width, height, rearDepth],
      [0, height / 2, -portalDepth / 2],
      palette.primary,
      0.018,
    ),
    "fireplace-rear-mass",
  );
  namePart(
    addBox(
      group,
      [openingWidth, openingHeight, recessDepth],
      [0, openingBottom + openingHeight / 2, recessZ],
      palette.dark,
      0.008,
    ),
    "fireplace-deep-firebox",
  );
  [-1, 1].forEach((side) => {
    namePart(
      addBox(
        group,
        [jambWidth, openingTop, portalDepth],
        [side * (openingWidth / 2 + jambWidth / 2), openingTop / 2, depth / 2 - portalDepth / 2],
        palette.primary,
        0.014,
      ),
      `fireplace-portal-${side > 0 ? "right" : "left"}`,
    );
  });
  namePart(
    addBox(
      group,
      [openingWidth, lintelHeight, portalDepth],
      [0, openingTop + lintelHeight / 2, depth / 2 - portalDepth / 2],
      palette.primary,
      0.014,
    ),
    "fireplace-portal-lintel",
  );
  namePart(
    addBox(
      group,
      [width, mantelHeight, depth],
      [0, Math.min(height - mantelHeight / 2, openingTop + lintelHeight + mantelHeight / 2), 0],
      palette.primary,
      0.016,
    ),
    "fireplace-mantel",
  );
  namePart(
    addBox(
      group,
      [width * 0.88, Math.min(0.07, height * 0.06), depth],
      [0, Math.min(0.07, height * 0.06) / 2, 0],
      palette.dark,
      0.012,
    ),
    "fireplace-hearth",
  );
}

function addProxyGeometry(group, definition, materials) {
  const palette = {
    primary: materialFrom(materials, definition.materialId, "textile-warm"),
    dark: materialFrom(materials, "oak-dark", definition.materialId),
    textile: materialFrom(materials, "textile-warm", definition.materialId),
    ceramic: materialFrom(materials, "sanitary-white", definition.materialId),
    glass: materialFrom(materials, "glass-clear", definition.materialId),
    trim: materialFrom(materials, "profile-black", "oak-dark", definition.materialId),
    metal: materialFrom(materials, "bronze", "profile-black", "oak-dark", definition.materialId),
  };
  const size = definition.size;

  switch (definition.kind) {
    case "bed": addBed(group, size, palette); break;
    case "bench": addBench(group, size, palette); break;
    case "chair": group.add(createChair(size, palette)); break;
    case "cabinet": addCabinet(group, size, palette); break;
    case "bathtub": addBathtub(group, size, palette); break;
    case "vanity": addVanity(group, size, palette); break;
    case "shower": addShower(group, size, palette); break;
    case "sofa": addSofa(group, size, palette); break;
    case "round-table": addRoundTable(group, size, palette); break;
    case "chair-ring": addChairRing(group, definition, palette); break;
    case "island": addIsland(group, size, palette); break;
    case "stool-row": addStoolRow(group, definition, palette); break;
    case "kitchen": addKitchen(group, size, palette); break;
    case "sectional-sofa": addSectionalSofa(group, size, palette); break;
    case "coffee-table": addCoffeeTable(group, size, palette); break;
    case "fireplace": addFireplace(group, size, palette); break;
    default:
      addBox(group, size, [0, size[1] / 2, 0], palette.primary, 0.025);
  }
}

/**
 * Builds dimensionally faithful silhouette proxies. Every child stays in the
 * local size envelope declared by the manifest; the group owns translation and
 * rotation so collision/debug layers can use the same contract.
 */
export function buildFurniture({ manifest, materials }) {
  const root = new THREE.Group();
  root.name = "furniture";
  const items = new Map();
  const pickables = [];

  manifest.furniture.forEach((definition) => {
    const group = new THREE.Group();
    group.name = definition.id;
    group.userData = {
      kind: "furniture",
      furnitureId: definition.id,
      roomId: definition.roomId,
      confidence: definition.confidence,
      collider: definition.collider !== false,
    };

    addProxyGeometry(group, definition, materials);
    if (ENRICHED_FURNITURE_KINDS.has(definition.kind)) {
      assertWithinEnvelope(group, definition.size, definition.id);
    }
    group.position.set(definition.position[0], definition.position[1], definition.position[2]);
    group.rotation.y = definition.rotationY ?? 0;
    const meshes = [];
    group.traverse((object) => {
      if (!object.isMesh) return;
      object.userData = {
        ...object.userData,
        kind: "furniture-part",
        furnitureId: definition.id,
        roomId: definition.roomId,
      };
      meshes.push(object);
      pickables.push(object);
    });

    root.add(group);
    items.set(definition.id, { definition, group, meshes });
  });

  return { root, items, pickables };
}
