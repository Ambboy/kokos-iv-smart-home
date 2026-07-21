import * as THREE from "three";

function addBoxHelpers(target, sourceRoot, color) {
  sourceRoot.traverse((object) => {
    if (!object.isMesh || object.userData.kind === "room") return;
    const helper = new THREE.BoxHelper(object, color);
    helper.material.transparent = true;
    helper.material.opacity = 0.7;
    helper.name = `bounds-${object.name || object.uuid}`;
    target.add(helper);
  });
}

export function buildDebugLayer({ manifest, architecture, furniture, doors, collisionReport }) {
  const root = new THREE.Group();
  root.name = "debug-layer";
  const lifecycle = { disposed: false };

  const bounds = new THREE.Group();
  bounds.name = "debug-bounds";
  addBoxHelpers(bounds, architecture.root, 0x6fae98);
  addBoxHelpers(bounds, furniture.root, 0xd7b870);
  bounds.visible = false;
  root.add(bounds);

  const markers = new THREE.Group();
  markers.name = "collision-markers";
  (collisionReport?.errors ?? collisionReport?.issues ?? [])
    .filter((issue) => issue.code?.includes("COLLISION"))
    .forEach((issue, index) => {
      const point = issue.debugGeometry?.point ?? issue.debug?.point ?? [0.35 + index * 0.2, 0.2, 0.35];
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 14, 14),
        new THREE.MeshBasicMaterial({ color: 0xe85f50, transparent: true, opacity: 0.86 }),
      );
      marker.position.set(point[0], point[1] ?? 0.2, point[2] ?? point[1]);
      marker.name = `collision-${index}`;
      markers.add(marker);
    });
  markers.visible = false;
  root.add(markers);

  const loader = new THREE.TextureLoader();
  const xs = manifest.shell.exterior.map(([x]) => x);
  const zs = manifest.shell.exterior.map(([, z]) => z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const createOverlayGeometry = () => {
    const geometry = new THREE.ShapeGeometry((() => {
      const shape = new THREE.Shape();
      manifest.shell.exterior.forEach(([x, z], index) => {
        if (index === 0) shape.moveTo(x, -z);
        else shape.lineTo(x, -z);
      });
      shape.closePath();
      return shape;
    })());
    const positions = geometry.getAttribute("position");
    const uvs = geometry.getAttribute("uv");
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const worldZ = -positions.getY(index);
      uvs.setXY(index, (x - minX) / (maxX - minX), (maxZ - worldZ) / (maxZ - minZ));
    }
    uvs.needsUpdate = true;
    return geometry;
  };
  const createOverlay = (path, name, y) => {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(createOverlayGeometry(), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.renderOrder = 8;
    mesh.name = name;
    mesh.visible = false;
    root.add(mesh);
    loader.load(
      path,
      (texture) => {
        if (lifecycle.disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        mesh.material.map = texture;
        mesh.material.needsUpdate = true;
      },
      undefined,
      () => {
        mesh.userData.loadError = true;
      },
    );
    return mesh;
  };
  const planOverlay = createOverlay(manifest.qa.planOverlay, "source-plan-overlay", 0.055);
  const lightOverlay = createOverlay(manifest.qa.lightOverlay, "source-light-overlay", 0.058);

  return {
    root,
    bounds,
    markers,
    overlay: planOverlay,
    planOverlay,
    lightOverlay,
    doorArcs: doors.arcs,
    dispose: () => { lifecycle.disposed = true; },
  };
}

export function updateDebugLayer(debugLayer, state) {
  debugLayer.bounds.visible = Boolean(state.bounds);
  debugLayer.markers.visible = Boolean(state.collisions);
  const opacity = Number.isFinite(state.overlayOpacity) ? state.overlayOpacity : 0.5;
  debugLayer.planOverlay.visible = Boolean(state.overlay) && state.overlayKind !== "light";
  debugLayer.lightOverlay.visible = Boolean(state.overlay) && state.overlayKind === "light";
  debugLayer.planOverlay.material.opacity = opacity;
  debugLayer.lightOverlay.material.opacity = opacity;
  debugLayer.doorArcs.visible = Boolean(state.doorArcs);
}
