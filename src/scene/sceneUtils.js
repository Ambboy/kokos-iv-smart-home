import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export function createMaterialRegistry(manifest) {
  return new Map(manifest.materials.map((definition) => {
    const common = {
      color: new THREE.Color(definition.color),
      roughness: definition.roughness ?? 0.7,
      metalness: definition.metalness ?? 0,
    };
    const material = definition.kind === "glass"
      ? new THREE.MeshPhysicalMaterial({
        ...common,
        transmission: definition.transmission ?? 0.94,
        thickness: definition.thickness ?? 0.012,
        ior: definition.ior ?? 1.5,
        transparent: false,
        opacity: 1,
        depthWrite: true,
        side: THREE.DoubleSide,
      })
      : new THREE.MeshStandardMaterial(common);
    material.name = `material-${definition.id}`;
    return [definition.id, material];
  }));
}

export function roundedBox(width, height, depth, material, radius = 0.035) {
  const safeRadius = Math.max(0, Math.min(radius, width * 0.48, height * 0.48, depth * 0.48));
  const geometry = safeRadius > 0.001
    ? new RoundedBoxGeometry(width, height, depth, 3, safeRadius)
    : new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function polygonShape(points) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], index) => {
    if (index === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  shape.closePath();
  return shape;
}

export function wallFrame(wall) {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dz);
  return {
    dx,
    dz,
    length,
    tangent: new THREE.Vector2(dx / length, dz / length),
    rotationY: -Math.atan2(dz, dx),
  };
}

export function pointAlongWall(wall, distance, y = 0) {
  const frame = wallFrame(wall);
  return new THREE.Vector3(
    wall.start[0] + frame.tangent.x * distance,
    y,
    wall.start[1] + frame.tangent.y * distance,
  );
}

export function wallInteriorNormal(wall, room) {
  const frame = wallFrame(wall);
  const center = pointAlongWall(wall, frame.length / 2);
  const roomCenter = room.focus ?? room.polygon.reduce(
    (sum, point) => [sum[0] + point[0] / room.polygon.length, 0, sum[2] + point[1] / room.polygon.length],
    [0, 0, 0],
  );
  const normalA = new THREE.Vector2(-frame.tangent.y, frame.tangent.x);
  const towardRoom = new THREE.Vector2(roomCenter[0] - center.x, roomCenter[2] - center.z);
  if (normalA.dot(towardRoom) < 0) normalA.multiplyScalar(-1);
  return normalA;
}

export function disposeObject(root) {
  const disposed = new Set();
  const disposeTexture = (texture) => {
    if (!texture?.isTexture || disposed.has(texture)) return;
    disposed.add(texture);
    texture.dispose();
  };
  const disposeMaterial = (material) => {
    if (!material || disposed.has(material)) return;
    Object.values(material).forEach(disposeTexture);
    disposed.add(material);
    material.dispose?.();
  };
  root.traverse((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) object.material.forEach(disposeMaterial);
    else disposeMaterial(object.material);
    disposeTexture(object.texture);
    disposeTexture(object.userData?.texture);
  });
}

export function createTextSprite(text, { color = "#dce7e1", background = "rgba(10,15,14,.72)" } = {}) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = 440 * ratio;
  canvas.height = 84 * ratio;
  context.scale(ratio, ratio);
  context.fillStyle = background;
  context.beginPath();
  context.roundRect(2, 2, 436, 80, 18);
  context.fill();
  context.font = "600 24px Inter, system-ui, sans-serif";
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 220, 42);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.65, 0.51, 1);
  sprite.userData.texture = texture;
  return sprite;
}

export function setObjectVisibility(root, visible) {
  if (root) root.visible = Boolean(visible);
}
