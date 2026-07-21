import * as THREE from "three";
import { roundedBox } from "./sceneUtils.js";

const MIN_PART = 0.012;

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
  addBox(group, [width, height, depth], [0, height / 2, 0], palette.primary, 0.018);
  const reveal = Math.min(0.014, width * 0.006);
  const faceDepth = Math.min(0.018, depth * 0.045);
  const panelCount = Math.max(1, Math.round(width / 0.72));
  for (let index = 1; index < panelCount; index += 1) {
    const x = -width / 2 + (index / panelCount) * width;
    addBox(group, [reveal, height * 0.94, faceDepth], [x, height * 0.5, depth / 2 - faceDepth / 2], palette.trim, 0);
  }
}

function addBathtub(group, [width, height, depth], palette) {
  addBox(group, [width, height, depth], [0, height / 2, 0], palette.primary, Math.min(0.12, depth * 0.18));
  const well = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.46, 0.018, 48),
    palette.glass,
  );
  well.scale.set(width * 0.72, 1, depth * 0.62);
  well.position.y = height - 0.014;
  well.castShadow = false;
  group.add(well);
}

function addVanity(group, [width, height, depth], palette) {
  const topHeight = Math.min(0.065, height * 0.09);
  addBox(group, [width * 0.94, height - topHeight, depth * 0.9], [0, (height - topHeight) / 2, 0], palette.dark, 0.024);
  addBox(group, [width, topHeight, depth], [0, height - topHeight / 2, 0], palette.primary, 0.018);
  const basin = addCylinder(
    group,
    Math.min(width, depth) * 0.21,
    MIN_PART,
    [0, height - MIN_PART / 2, 0],
    palette.ceramic,
    32,
  );
  basin.scale.z = 0.68;
}

function addShower(group, [width, height, depth], palette) {
  const pane = Math.min(0.018, width * 0.02, depth * 0.02);
  const baseHeight = Math.min(0.055, height * 0.04);
  addBox(group, [width, baseHeight, depth], [0, baseHeight / 2, 0], palette.ceramic, 0.015);
  const back = addBox(group, [width, height, pane], [0, height / 2, -depth / 2 + pane / 2], palette.glass, 0);
  const side = addBox(group, [pane, height, depth], [-width / 2 + pane / 2, height / 2, 0], palette.glass, 0);
  back.castShadow = false;
  side.castShadow = false;
}

function addSofa(group, [width, height, depth], palette) {
  const armWidth = Math.min(0.22, width * 0.12);
  const backDepth = Math.min(0.2, depth * 0.2);
  const baseHeight = height * 0.32;
  const seatHeight = height * 0.22;
  addBox(group, [width, baseHeight, depth * 0.78], [0, baseHeight / 2, depth * 0.05], palette.dark, 0.075);
  addBox(group, [width - armWidth * 2, seatHeight, depth * 0.62], [0, baseHeight + seatHeight / 2, depth * 0.08], palette.primary, 0.085);
  addBox(group, [width, height, backDepth], [0, height / 2, -depth / 2 + backDepth / 2], palette.primary, 0.075);
  [-1, 1].forEach((side) => {
    addBox(group, [armWidth, height * 0.62, depth], [side * (width / 2 - armWidth / 2), height * 0.31, 0], palette.primary, 0.075);
  });
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
  addBox(group, [width * 0.9, height - topHeight, depth * 0.84], [0, (height - topHeight) / 2, 0], palette.dark, 0.025);
  addBox(group, [width, topHeight, depth], [0, height - topHeight / 2, 0], palette.primary, 0.02);
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
  addBox(group, [width, counterHeight - topHeight, depth], [0, (counterHeight - topHeight) / 2, 0], palette.dark, 0.012);
  addBox(group, [width, topHeight, depth], [0, counterHeight - topHeight / 2, 0], palette.primary, 0.008);

  const tallWidth = Math.min(width * 0.28, 1.25);
  [-1, 1].forEach((side) => {
    addBox(group, [tallWidth, height, depth], [side * (width / 2 - tallWidth / 2), height / 2, 0], palette.dark, 0.012);
  });
  const upperWidth = Math.max(MIN_PART, width - tallWidth * 2 - 0.05);
  const upperHeight = Math.max(0.25, height - counterHeight - 0.36);
  addBox(
    group,
    [upperWidth, upperHeight, depth * 0.52],
    [0, height - upperHeight / 2, -depth * 0.24],
    palette.primary,
    0.012,
  );
}

function addSectionalSofa(group, [width, height, depth], palette) {
  const mainDepth = Math.min(depth, Math.max(0.82, depth * 0.38));
  const returnWidth = Math.min(width * 0.28, 1.15);
  const baseHeight = height * 0.34;
  const backDepth = Math.min(0.2, mainDepth * 0.22);
  addBox(group, [width, baseHeight, mainDepth], [0, baseHeight / 2, depth / 2 - mainDepth / 2], palette.dark, 0.075);
  addBox(group, [returnWidth, baseHeight, depth], [width / 2 - returnWidth / 2, baseHeight / 2, 0], palette.dark, 0.075);
  addBox(group, [width, height, backDepth], [0, height / 2, depth / 2 - backDepth / 2], palette.primary, 0.07);
  addBox(group, [returnWidth, height * 0.72, depth], [width / 2 - returnWidth / 2, height * 0.36, 0], palette.primary, 0.07);
  addBox(
    group,
    [width - returnWidth * 1.1, height * 0.22, Math.max(0.1, mainDepth - backDepth - 0.08)],
    [-returnWidth * 0.42, baseHeight + height * 0.11, depth / 2 - mainDepth * 0.48],
    palette.primary,
    0.08,
  );
}

function addCoffeeTable(group, [width, height, depth], palette) {
  const table = addCylinder(group, 0.5, height, [0, height / 2, 0], palette.primary, 48);
  table.scale.set(width, 1, depth);
}

function addFireplace(group, [width, height, depth], palette) {
  addBox(group, [width, height, depth], [0, height / 2, 0], palette.primary, 0.018);
  const openingWidth = width * 0.72;
  const openingHeight = height * 0.48;
  addBox(
    group,
    [openingWidth, openingHeight, Math.min(0.018, depth * 0.05)],
    [0, openingHeight * 0.62, depth / 2 - Math.min(0.018, depth * 0.05) / 2],
    palette.dark,
    0.008,
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
    group.position.set(definition.position[0], definition.position[1], definition.position[2]);
    group.rotation.y = definition.rotationY ?? 0;
    group.userData = {
      kind: "furniture",
      furnitureId: definition.id,
      roomId: definition.roomId,
      confidence: definition.confidence,
      collider: definition.collider !== false,
    };

    addProxyGeometry(group, definition, materials);
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
