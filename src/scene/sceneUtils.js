import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const PROCEDURAL_TEXTURE_SIZE = 128;
const PROCEDURAL_MATERIALS = new Map([
  ["oak-edinburgh", { pattern: "wood", seed: 11, bumpScale: 0.012 }],
  ["oak-dark", { pattern: "wood", seed: 29, bumpScale: 0.012 }],
  ["stone-statuario", { pattern: "stone", seed: 41, bumpScale: 0.006 }],
  ["stone-calacatta", { pattern: "stone", seed: 53, bumpScale: 0.006 }],
  ["stone-calce", { pattern: "stone", seed: 67, bumpScale: 0.006 }],
  ["stone-cristallo", { pattern: "stone", seed: 79, bumpScale: 0.006 }],
  ["textile-warm", { pattern: "textile", seed: 83, bumpScale: 0.018 }],
  ["textile-olive", { pattern: "textile", seed: 97, bumpScale: 0.018 }],
  ["textile-ink", { pattern: "textile", seed: 109, bumpScale: 0.018 }],
  ["wall-warm-greige", { pattern: "plaster", seed: 127, bumpScale: 0.008 }],
  ["charcoal-entrance", { pattern: "tile", seed: 139, bumpScale: 0.01 }],
]);

function clampByte(value) {
  return Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255);
}

function hashNoise(x, y, seed) {
  let hash = Math.imul(x + seed * 1013, 374761393) + Math.imul(y + seed * 1619, 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff;
}

function smoothNoise(u, v, seed, frequency) {
  const x = u * frequency;
  const y = v * frequency;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const top = THREE.MathUtils.lerp(hashNoise(x0, y0, seed), hashNoise(x0 + 1, y0, seed), sx);
  const bottom = THREE.MathUtils.lerp(hashNoise(x0, y0 + 1, seed), hashNoise(x0 + 1, y0 + 1, seed), sx);
  return THREE.MathUtils.lerp(top, bottom, sy);
}

function fract(value) {
  return value - Math.floor(value);
}

function woodSample(u, v, seed) {
  const rowCoordinate = v * 6;
  const row = Math.floor(rowCoordinate);
  const across = fract(rowCoordinate);
  const along = fract(u * 2 + (row % 2) * 0.5);
  const rowSeam = Math.min(across, 1 - across) < 0.022;
  const endSeam = Math.min(along, 1 - along) < 0.014;
  const noise = smoothNoise(u, v, seed, 12) - 0.5;
  const grain = Math.sin((u * 31 + noise * 1.8 + row * 0.37) * Math.PI * 2);
  const seam = rowSeam || endSeam;
  return {
    shade: seam ? 0.7 : 0.93 + grain * 0.025 + noise * 0.035,
    height: seam ? 0.12 : 0.58 + grain * 0.13 + noise * 0.12,
  };
}

function stoneSample(u, v, seed) {
  const coarse = smoothNoise(u, v, seed, 4) - 0.5;
  const fine = smoothNoise(u, v, seed + 17, 15) - 0.5;
  const phase = (u * 1.15 + v * 0.72 + coarse * 0.2) * Math.PI * 5 + seed * 0.19;
  const secondaryPhase = (u * 0.55 - v * 1.3 + fine * 0.16) * Math.PI * 7 - seed * 0.11;
  const primaryVein = Math.exp(-72 * Math.sin(phase) ** 2);
  const secondaryVein = Math.exp(-110 * Math.sin(secondaryPhase) ** 2) * 0.58;
  const vein = Math.max(primaryVein, secondaryVein);
  return {
    shade: 0.975 - vein * 0.22 + fine * 0.018,
    height: 0.62 - vein * 0.2 + fine * 0.08,
  };
}

function textileSample(u, v, seed) {
  const threadCount = 24;
  const warp = (Math.sin(u * Math.PI * 2 * threadCount) + 1) * 0.5;
  const weft = (Math.sin(v * Math.PI * 2 * threadCount) + 1) * 0.5;
  const warpIndex = Math.floor(u * threadCount);
  const weftIndex = Math.floor(v * threadCount);
  const over = (warpIndex + weftIndex + seed) % 2 === 0 ? warp : weft;
  const noise = smoothNoise(u, v, seed, 18) - 0.5;
  return {
    shade: 0.93 + over * 0.045 + noise * 0.018,
    height: 0.28 + over * 0.58 + noise * 0.08,
  };
}

function plasterSample(u, v, seed) {
  const coarse = smoothNoise(u, v, seed, 7) - 0.5;
  const medium = smoothNoise(u, v, seed + 23, 21) - 0.5;
  const fine = hashNoise(Math.floor(u * PROCEDURAL_TEXTURE_SIZE), Math.floor(v * PROCEDURAL_TEXTURE_SIZE), seed + 47) - 0.5;
  const noise = coarse * 0.52 + medium * 0.32 + fine * 0.16;
  return {
    shade: 0.96 + noise * 0.07,
    height: 0.52 + noise * 0.42,
  };
}

function tileSample(u, v, seed) {
  const tileU = fract(u * 2);
  const tileV = fract(v * 2);
  const grout = Math.min(tileU, 1 - tileU, tileV, 1 - tileV) < 0.022;
  const noise = smoothNoise(u, v, seed, 14) - 0.5;
  return {
    shade: grout ? 0.72 : 0.95 + noise * 0.035,
    height: grout ? 0.08 : 0.58 + noise * 0.12,
  };
}

const PROCEDURAL_SAMPLERS = {
  wood: woodSample,
  stone: stoneSample,
  textile: textileSample,
  plaster: plasterSample,
  tile: tileSample,
};

function createDataTexture(data, id, role, colorSpace) {
  const texture = new THREE.DataTexture(
    data,
    PROCEDURAL_TEXTURE_SIZE,
    PROCEDURAL_TEXTURE_SIZE,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.name = `procedural-${id}-${role}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createProceduralMaps(id, profile) {
  const mapData = new Uint8Array(PROCEDURAL_TEXTURE_SIZE * PROCEDURAL_TEXTURE_SIZE * 4);
  const bumpData = new Uint8Array(PROCEDURAL_TEXTURE_SIZE * PROCEDURAL_TEXTURE_SIZE * 4);
  const sample = PROCEDURAL_SAMPLERS[profile.pattern];

  for (let y = 0; y < PROCEDURAL_TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < PROCEDURAL_TEXTURE_SIZE; x += 1) {
      const u = (x + 0.5) / PROCEDURAL_TEXTURE_SIZE;
      const v = (y + 0.5) / PROCEDURAL_TEXTURE_SIZE;
      const { shade, height } = sample(u, v, profile.seed);
      const mapValue = clampByte(shade);
      const bumpValue = clampByte(height);
      const offset = (y * PROCEDURAL_TEXTURE_SIZE + x) * 4;
      mapData[offset] = mapValue;
      mapData[offset + 1] = mapValue;
      mapData[offset + 2] = mapValue;
      mapData[offset + 3] = 255;
      bumpData[offset] = bumpValue;
      bumpData[offset + 1] = bumpValue;
      bumpData[offset + 2] = bumpValue;
      bumpData[offset + 3] = 255;
    }
  }

  return {
    map: createDataTexture(mapData, id, "map", THREE.SRGBColorSpace),
    bumpMap: createDataTexture(bumpData, id, "bump", THREE.NoColorSpace),
    bumpScale: profile.bumpScale,
  };
}

export function createMaterialRegistry(manifest) {
  return new Map(manifest.materials.map((definition) => {
    const procedural = PROCEDURAL_MATERIALS.get(definition.id);
    const common = {
      color: new THREE.Color(definition.color),
      roughness: definition.roughness ?? 0.7,
      metalness: definition.metalness ?? 0,
      ...(procedural ? createProceduralMaps(definition.id, procedural) : {}),
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
