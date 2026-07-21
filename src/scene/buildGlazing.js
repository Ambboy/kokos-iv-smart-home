import * as THREE from "three";
import { pointAlongWall, roundedBox, wallFrame } from "./sceneUtils.js";

export function buildGlazing({ manifest, materials }) {
  const root = new THREE.Group();
  root.name = "glazing";
  const panes = new Map();
  const profile = materials.get("profile-black");
  const glass = materials.get("glass-clear");

  manifest.glazing.forEach((definition) => {
    const wall = manifest.walls.find((item) => item.id === definition.wallId);
    const frame = wallFrame(wall);
    const group = new THREE.Group();
    const frameWidth = definition.frameWidth ?? 0.055;
    const frameDepth = definition.frameDepth ?? Math.max(0.07, wall.thickness * 0.58);
    const center = pointAlongWall(wall, definition.offset + definition.width / 2, definition.sill + definition.height / 2);
    group.position.copy(center);
    group.rotation.y = frame.rotationY;
    group.name = definition.id;
    group.userData = { kind: "glazing", glazingId: definition.id, confidence: definition.confidence };

    const innerWidth = Math.max(0.05, definition.width - frameWidth * 2);
    const innerHeight = Math.max(0.05, definition.height - frameWidth * 2);
    const pane = roundedBox(innerWidth, innerHeight, definition.glassThickness ?? 0.012, glass, 0);
    pane.position.y = 0;
    pane.castShadow = false;
    pane.renderOrder = 4;
    pane.name = `glass-${definition.id}`;
    pane.userData = { kind: "glass", glazingId: definition.id };
    group.add(pane);

    const top = roundedBox(definition.width, frameWidth, frameDepth, profile, 0);
    const bottom = top.clone();
    top.position.y = definition.height / 2 - frameWidth / 2;
    bottom.position.y = -definition.height / 2 + frameWidth / 2;
    const side = roundedBox(frameWidth, definition.height - frameWidth * 2, frameDepth, profile, 0);
    const left = side.clone();
    const right = side.clone();
    left.position.x = -definition.width / 2 + frameWidth / 2;
    right.position.x = definition.width / 2 - frameWidth / 2;
    group.add(top, bottom, left, right);

    root.add(group);
    panes.set(definition.id, { definition, group, pane });
  });

  return { root, panes };
}
