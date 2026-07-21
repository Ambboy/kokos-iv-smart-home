import * as THREE from "three";
import { pointAlongWall, roundedBox, wallFrame } from "./sceneUtils.js";

function arcGeometry(radius, direction = 1) {
  const points = Array.from({ length: 33 }, (_, index) => {
    const angle = direction * (index / 32) * Math.PI / 2;
    return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  });
  return new THREE.BufferGeometry().setFromPoints(points);
}

export function buildDoors({ manifest, materials }) {
  const root = new THREE.Group();
  root.name = "doors";
  const arcs = new THREE.Group();
  arcs.name = "door-swing-arcs";
  arcs.visible = false;
  const doors = new Map();
  const leafMaterial = materials.get("oak-dark");
  const frameMaterial = materials.get("profile-black");

  manifest.doors.forEach((definition) => {
    const wall = manifest.walls.find((item) => item.id === definition.wallId);
    const frame = wallFrame(wall);
    const center = pointAlongWall(wall, definition.offset + definition.width / 2, 0);
    const group = new THREE.Group();
    group.position.copy(center);
    group.rotation.y = frame.rotationY;
    group.name = definition.id;
    group.userData = { kind: "door", doorId: definition.id };

    const jambDepth = Math.max(wall.thickness + 0.025, 0.12);
    const jambWidth = 0.045;
    const leftJamb = roundedBox(jambWidth, definition.height, jambDepth, frameMaterial, 0);
    const rightJamb = leftJamb.clone();
    leftJamb.position.set(-definition.width / 2, definition.height / 2, 0);
    rightJamb.position.set(definition.width / 2, definition.height / 2, 0);
    group.add(leftJamb, rightJamb);

    const leafCount = definition.leafCount ?? 1;
    const leafWidths = Array.isArray(definition.leafWidths)
      ? definition.leafWidths
      : Array.from({ length: leafCount }, () => definition.leafWidth);
    const addLeaf = (side, angle, declaredWidth) => {
      const leafWidth = Math.min(declaredWidth, definition.width - 0.05);
      const pivot = new THREE.Group();
      pivot.position.x = side * (definition.width / 2 - 0.035);
      pivot.rotation.y = angle;
      const leaf = roundedBox(leafWidth, definition.height - 0.08, 0.045, leafMaterial, 0);
      leaf.position.set(-side * leafWidth / 2, (definition.height - 0.08) / 2, 0);
      leaf.userData = { kind: "door-leaf", doorId: definition.id };
      pivot.add(leaf);
      group.add(pivot);
    };
    if (leafCount === 2) {
      addLeaf(-1, definition.swing * 0.3, leafWidths[0]);
      addLeaf(1, -definition.swing * 0.3, leafWidths[1]);
    } else {
      const side = definition.hinge === "start" ? -1 : 1;
      addLeaf(side, definition.swing * 0.55, leafWidths[0]);
    }
    root.add(group);

    const arcGroup = new THREE.Group();
    arcGroup.name = `arcs-${definition.id}`;
    const addArc = (hingeDistance, radius, direction, baseRotation) => {
      const arc = new THREE.Line(
        arcGeometry(radius, direction),
        new THREE.LineBasicMaterial({ color: "#d7b870", transparent: true, opacity: 0.72 }),
      );
      arc.position.copy(pointAlongWall(wall, hingeDistance, 0.035));
      arc.rotation.y = frame.rotationY + baseRotation;
      arc.name = `arc-${definition.id}-${arcGroup.children.length + 1}`;
      arcGroup.add(arc);
    };
    if (leafCount === 2) {
      addArc(definition.offset, leafWidths[0], definition.swing, 0);
      addArc(definition.offset + definition.width, leafWidths[1], -definition.swing, Math.PI);
    } else {
      const atEnd = definition.hinge === "end";
      addArc(definition.offset + (atEnd ? definition.width : 0), leafWidths[0], definition.swing, atEnd ? Math.PI : 0);
    }
    arcs.add(arcGroup);
    doors.set(definition.id, { group, arc: arcGroup });
  });

  root.add(arcs);
  return { root, doors, arcs };
}
