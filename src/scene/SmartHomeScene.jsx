import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  buildArchitecture,
  updateArchitecturePresentation,
  updateRoomAppearance,
} from "./buildArchitecture.js";
import { buildCurtains, updateCurtains } from "./buildCurtains.js";
import { buildDebugLayer, updateDebugLayer } from "./buildDebug.js";
import { buildDoors } from "./buildDoors.js";
import { buildFurniture } from "./buildFurniture.js";
import { buildGlazing } from "./buildGlazing.js";
import { buildLights, updateLights } from "./buildLights.js";
import { createMaterialRegistry, disposeObject, pointAlongWall, wallFrame, wallInteriorNormal } from "./sceneUtils.js";

function presentationContract(manifest) {
  const xs = manifest.shell.exterior.map(([x]) => x);
  const zs = manifest.shell.exterior.map(([, z]) => z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const span = Math.max(maxX - minX, maxZ - minZ);
  const center = [(minX + maxX) / 2, (minZ + maxZ) / 2];
  return {
    center,
    span,
    presets: {
      dollhouse: { position: [center[0] + span * 0.68, span * 0.72, center[1] + span * 0.72], target: [center[0], 0.45, center[1]] },
      top: { position: [center[0], span * 1.42, center[1]], target: [center[0], 0, center[1]] },
      glazing: { position: [center[0] + span * 0.64, 4.8, center[1] + span * 0.22], target: [center[0] + span * 0.43, 1.6, center[1] - span * 0.14] },
    },
  };
}

function relativeRect(element, hostRect) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    left: rect.left - hostRect.left,
    right: rect.right - hostRect.left,
    top: rect.top - hostRect.top,
    bottom: rect.bottom - hostRect.top,
  };
}

function presentationSafeFrame(host, mode) {
  const hostRect = host.getBoundingClientRect();
  const app = host.closest(".smart-home-app, .app-shell");
  const uiVisible = app?.dataset.uiVisible !== "false";
  const frame = { left: 0, right: 0, top: 0, bottom: 0, uiVisible };
  if (!uiVisible || !app) return frame;

  const rect = (selector) => relativeRect(app.querySelector(selector), hostRect);
  const topbar = rect(".ui-topbar");
  const roomRail = rect(".ui-room-rail");
  const devicePanel = rect(".ui-device-panel");
  const modeSwitch = rect(".ui-mode-switch");
  const mobileControlsToggle = rect(".ui-mobile-controls-toggle");
  const secondaryControls = rect(".ui-secondary-controls");
  const scenarioBar = rect(".ui-scenario-bar");
  const cameraToolbar = rect(".ui-camera-toolbar");
  const mobile = hostRect.width <= 820;

  if (mobile) {
    frame.left = 12;
    frame.right = 12;
    frame.top = Math.max(
      topbar?.bottom ?? 0,
      modeSwitch?.bottom ?? 0,
      mobileControlsToggle?.bottom ?? 0,
      secondaryControls?.bottom ?? 0,
      scenarioBar?.bottom ?? 0,
      cameraToolbar?.bottom ?? 0,
    ) + 14;
    const lowerBoundary = mode === "devices" && devicePanel
      ? devicePanel.top
      : roomRail?.top;
    frame.bottom = lowerBoundary == null ? 16 : Math.max(16, hostRect.height - lowerBoundary + 14);
    return frame;
  }

  frame.left = roomRail ? roomRail.right + 20 : 24;
  frame.right = devicePanel ? Math.max(24, hostRect.width - devicePanel.left + 20) : 24;
  frame.top = Math.max(topbar?.bottom ?? 0, modeSwitch?.bottom ?? 0) + 16;
  const lowerControlsTop = [scenarioBar?.top, cameraToolbar?.top]
    .filter(Number.isFinite);
  frame.bottom = lowerControlsTop.length > 0
    ? Math.max(24, hostRect.height - Math.min(...lowerControlsTop) + 14)
    : 24;
  return frame;
}

function applyPresentationSafeFrame(runtime, host, width, height) {
  const camera = runtime.camera;
  camera.aspect = width / height;
  const frame = presentationSafeFrame(host, runtime.mode);
  if (!frame.uiVisible) {
    camera.zoom = 1;
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    return;
  }

  const safeWidth = Math.max(width * 0.24, width - frame.left - frame.right);
  const safeHeight = Math.max(height * 0.1, height - frame.top - frame.bottom);
  const safeCenterX = frame.left + safeWidth / 2;
  const safeCenterY = frame.top + safeHeight / 2;
  const safeScale = Math.min(safeWidth / width, safeHeight / height);
  camera.zoom = THREE.MathUtils.clamp(safeScale, 0.48, 0.94);
  camera.setViewOffset(
    width,
    height,
    width / 2 - safeCenterX,
    height / 2 - safeCenterY,
    width,
    height,
  );
  camera.updateProjectionMatrix();
}

function roomCamera(room) {
  const xs = room.polygon.map(([x]) => x);
  const zs = room.polygon.map(([, z]) => z);
  const maxDimension = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...zs) - Math.min(...zs),
  );
  const orbit = Math.max(3.2, maxDimension * 1.05);
  const target = new THREE.Vector3(room.focus[0], 0.62, room.focus[2]);
  const position = new THREE.Vector3(
    target.x + orbit * 0.74,
    THREE.MathUtils.clamp(maxDimension * 0.62, 3.25, 6.8),
    target.z + orbit * 0.8,
  );
  return { position, target };
}

function moveCamera(camera, direction, amount) {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  if (direction === "forward") camera.position.addScaledVector(forward, amount);
  if (direction === "back") camera.position.addScaledVector(forward, -amount);
  if (direction === "left") camera.position.addScaledVector(right, -amount);
  if (direction === "right") camera.position.addScaledVector(right, amount);
  if (direction === "up") camera.position.y += amount;
  if (direction === "down") camera.position.y = Math.max(0.35, camera.position.y - amount);
}

export function SmartHomeScene({
  manifest,
  devices,
  mode,
  selectedRoomId,
  onSelectRoom,
  onSelectDevice,
  scenarioId,
  viewPreset,
  debugState,
  flightMode,
  onFlightModeChange,
  flightAction,
  reducedMotion,
  qaGlazingId,
  qaGlazingSide,
  collisionReport,
  presentationLayoutKey,
  onReady,
}) {
  const hostRef = useRef(null);
  const runtimeRef = useRef(null);
  const devicesRef = useRef(devices);
  const deviceMapRef = useRef(new Map(devices.map((device) => [device.id, device])));
  const callbacksRef = useRef({ onSelectRoom, onSelectDevice, onFlightModeChange });

  useEffect(() => {
    devicesRef.current = devices;
    deviceMapRef.current = new Map(devices.map((device) => [device.id, device]));
  }, [devices]);

  useEffect(() => {
    callbacksRef.current = { onSelectRoom, onSelectDevice, onFlightModeChange };
  }, [onSelectRoom, onSelectDevice, onFlightModeChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const scene = new THREE.Scene();
    const presentation = presentationContract(manifest);
    scene.background = new THREE.Color("#100f0d");
    scene.fog = new THREE.FogExp2("#100f0d", 0.008);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.08, 90);
    camera.position.fromArray(presentation.presets.dollhouse.position);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    renderer.domElement.className = "scene-canvas";
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("aria-label", "Интерактивная 3D-модель квартиры. Перетаскивайте для вращения, используйте колесо для масштаба.");
    host.append(renderer.domElement);

    const environmentGenerator = new THREE.PMREMGenerator(renderer);
    const environmentTarget = environmentGenerator.fromScene(new RoomEnvironment(), 0.035);
    scene.environment = environmentTarget.texture;
    environmentGenerator.dispose();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !reducedMotion;
    controls.dampingFactor = 0.065;
    controls.target.fromArray(presentation.presets.dollhouse.target);
    controls.minDistance = 0.85;
    controls.maxDistance = 38;
    controls.minPolarAngle = 0.08;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.zoomToCursor = true;
    controls.screenSpacePanning = true;
    controls.update();

    const hemisphere = new THREE.HemisphereLight(0xcbdad3, 0x2a2522, 1.85);
    scene.add(hemisphere);
    const sun = new THREE.DirectionalLight(0xfff2d8, 3.2);
    sun.position.set(
      presentation.center[0] - presentation.span * 0.55,
      presentation.span * 0.92,
      presentation.center[1] - presentation.span * 0.35,
    );
    const sunTarget = new THREE.Object3D();
    sunTarget.position.set(presentation.center[0], 0, presentation.center[1]);
    sun.target = sunTarget;
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    const shadowReach = presentation.span * 0.68;
    sun.shadow.camera.left = -shadowReach;
    sun.shadow.camera.right = shadowReach;
    sun.shadow.camera.top = shadowReach;
    sun.shadow.camera.bottom = -shadowReach;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = presentation.span * 2.4;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025;
    scene.add(sun, sunTarget);

    const materials = createMaterialRegistry(manifest);
    const architecture = buildArchitecture({ manifest, materials });
    const glazing = buildGlazing({ manifest, materials });
    const doors = buildDoors({ manifest, materials });
    const furniture = buildFurniture({ manifest, materials });
    const lights = buildLights({ manifest, materials, devices: devicesRef.current });
    const curtains = buildCurtains({ manifest, materials, devices: devicesRef.current });
    const debug = buildDebugLayer({ manifest, architecture, furniture, doors, collisionReport });
    scene.add(architecture.root, glazing.root, doors.root, furniture.root, lights.root, curtains.root, debug.root);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(presentation.span * 14, presentation.span * 14),
      new THREE.MeshBasicMaterial({ color: "#12100d" }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(presentation.center[0], -0.13, presentation.center[1]);
    ground.receiveShadow = false;
    ground.name = "presentation-ground";
    scene.add(ground);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const keys = new Set();
    const touchMoves = new Set();
    let previousFrameTime = performance.now();
    const cameraGoal = { position: null, target: null, progress: 1 };
    const drag = { active: false, moved: false, x: 0, y: 0, yaw: 0, pitch: -0.12 };
    let frameId = 0;

    const runtime = {
      scene,
      camera,
      renderer,
      controls,
      architecture,
      glazing,
      doors,
      furniture,
      lights,
      curtains,
      debug,
      materials,
      hemisphere,
      sun,
      ground,
      cameraGoal,
      flightMode: false,
      sceneLightFactor: 0.55,
      mode,
      reducedMotion,
      presentation,
      viewPreset,
      debugPresentation: false,
      drag,
      touchMoves,
    };
    runtimeRef.current = runtime;

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      applyPresentationSafeFrame(runtime, host, width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
      renderer.setSize(width, height, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const onPointerDown = (event) => {
      drag.active = true;
      drag.moved = false;
      drag.x = event.clientX;
      drag.y = event.clientY;
      renderer.domElement.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event) => {
      if (!drag.active) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (!runtime.flightMode) return;
      drag.yaw -= dx * 0.0038;
      drag.pitch = THREE.MathUtils.clamp(drag.pitch - dy * 0.0032, -1.15, 1.15);
      camera.rotation.order = "YXZ";
      camera.rotation.y = drag.yaw;
      camera.rotation.x = drag.pitch;
    };
    const onPointerUp = (event) => {
      const wasMoved = drag.moved;
      drag.active = false;
      if (runtime.flightMode || wasMoved) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const targets = [...lights.hitTargets, ...curtains.hitTargets, ...architecture.floorMeshes];
      const hit = raycaster.intersectObjects(targets, true)[0]?.object;
      if (!hit) return;
      if (hit.userData.deviceId) callbacksRef.current.onSelectDevice?.(hit.userData.deviceId);
      if (hit.userData.roomId) callbacksRef.current.onSelectRoom?.(hit.userData.roomId);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape" && runtime.flightMode) callbacksRef.current.onFlightModeChange?.(false);
      keys.add(event.code);
    };
    const onKeyUp = (event) => keys.delete(event.code);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const frameTime = performance.now();
      const delta = Math.min((frameTime - previousFrameTime) / 1000, 0.05);
      previousFrameTime = frameTime;
      if (runtime.flightMode) {
        const speed = (keys.has("ShiftLeft") || keys.has("ShiftRight")) ? 6.2 : 2.8;
        if (keys.has("KeyW") || keys.has("ArrowUp") || touchMoves.has("forward")) moveCamera(camera, "forward", speed * delta);
        if (keys.has("KeyS") || keys.has("ArrowDown") || touchMoves.has("back")) moveCamera(camera, "back", speed * delta);
        if (keys.has("KeyA") || keys.has("ArrowLeft") || touchMoves.has("left")) moveCamera(camera, "left", speed * delta);
        if (keys.has("KeyD") || keys.has("ArrowRight") || touchMoves.has("right")) moveCamera(camera, "right", speed * delta);
        if (keys.has("KeyE") || touchMoves.has("up")) moveCamera(camera, "up", speed * delta);
        if (keys.has("KeyQ") || touchMoves.has("down")) moveCamera(camera, "down", speed * delta);
      } else {
        if (cameraGoal.progress < 1 && cameraGoal.position && cameraGoal.target) {
          const step = runtime.reducedMotion ? 1 : 1 - Math.exp(-delta * 5.4);
          camera.position.lerp(cameraGoal.position, step);
          controls.target.lerp(cameraGoal.target, step);
          if (camera.position.distanceTo(cameraGoal.position) < 0.025) cameraGoal.progress = 1;
        }
        controls.update();
      }
      updateArchitecturePresentation(architecture, {
        camera,
        target: controls.target,
        enabled: !runtime.flightMode
          && runtime.viewPreset !== "top"
          && runtime.viewPreset !== "glazing"
          && !runtime.debugPresentation,
        focusOccluders: runtime.viewPreset === "room",
      });
      updateLights(lights, delta, {
        devices: deviceMapRef.current,
        sceneFactor: runtime.sceneLightFactor,
        reducedMotion: runtime.reducedMotion,
      });
      updateCurtains(curtains, deviceMapRef.current, delta, runtime.reducedMotion);
      renderer.render(scene, camera);
    };
    animate();
    onReady?.();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      controls.dispose();
      debug.dispose?.();
      disposeObject(scene);
      renderer.dispose();
      environmentTarget.dispose();
      renderer.domElement.remove();
      runtimeRef.current = null;
    };
  }, [manifest, collisionReport]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.mode = mode;
    runtime.architecture.labels.visible = mode === "rooms";
    const { width, height } = hostRef.current?.getBoundingClientRect() ?? {};
    if (width && height) applyPresentationSafeFrame(runtime, hostRef.current, width, height);
  }, [mode, selectedRoomId, presentationLayoutKey]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const climate = devices.filter((device) => device.kind === "climate");
    updateRoomAppearance(runtime.architecture, selectedRoomId, climate);
  }, [devices, selectedRoomId]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.reducedMotion = reducedMotion;
    runtime.controls.enableDamping = !reducedMotion;
  }, [reducedMotion]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const evening = scenarioId === "evening";
    const away = scenarioId === "away";
    runtime.scene.background.set(evening ? "#0a0908" : away ? "#060505" : "#100f0d");
    runtime.scene.fog.color.copy(runtime.scene.background);
    runtime.ground.material.color.set(evening ? "#0a0908" : away ? "#060505" : "#12100d");
    runtime.scene.environmentIntensity = evening ? 0.16 : away ? 0.08 : 1;
    runtime.hemisphere.color.set(evening ? "#e8d3b4" : away ? "#b8bec4" : "#dfe3dc");
    runtime.hemisphere.groundColor.set(evening ? "#241b12" : away ? "#14120f" : "#2a2522");
    runtime.hemisphere.intensity = away ? 0.3 : evening ? 0.5 : 1.9;
    runtime.sun.color.set(evening ? "#ffc98f" : "#fff2d8");
    runtime.sun.intensity = away ? 0.1 : evening ? 0.22 : 3.2;
    runtime.renderer.toneMappingExposure = evening ? 1.16 : away ? 0.72 : 1.08;
    runtime.sceneLightFactor = evening ? 1.2 : away ? 0.85 : 0.55;
  }, [scenarioId]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.debugPresentation = Boolean(
      debugState.bounds || debugState.collisions || debugState.doorArcs || debugState.overlay,
    );
    updateDebugLayer(runtime.debug, debugState);
  }, [debugState]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || flightMode === runtime.flightMode) return;
    runtime.flightMode = flightMode;
    runtime.controls.enabled = !flightMode;
    if (flightMode) {
      const room = manifest.rooms.find((item) => item.id === selectedRoomId) ?? manifest.rooms.at(-1);
      runtime.camera.position.set(room.focus[0], 1.65, room.focus[2]);
      runtime.camera.rotation.order = "YXZ";
      runtime.camera.rotation.set(-0.12, -0.7, 0);
      runtime.drag.pitch = runtime.camera.rotation.x;
      runtime.drag.yaw = runtime.camera.rotation.y;
    } else {
      runtime.touchMoves.clear();
      const forward = new THREE.Vector3();
      runtime.camera.getWorldDirection(forward);
      runtime.controls.target.copy(runtime.camera.position).addScaledVector(forward, 3);
      runtime.controls.update();
    }
  }, [flightMode, manifest, selectedRoomId]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !flightAction || !runtime.flightMode) return;
    if (flightAction.active) runtime.touchMoves.add(flightAction.direction);
    else runtime.touchMoves.delete(flightAction.direction);
  }, [flightAction]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || runtime.flightMode) return;
    runtime.viewPreset = viewPreset;
    runtime.camera.up.set(0, viewPreset === "top" ? 0 : 1, viewPreset === "top" ? -1 : 0);
    const preset = presentationContract(manifest).presets[viewPreset];
    const room = manifest.rooms.find((item) => item.id === selectedRoomId);
    let position;
    let target;
    if (viewPreset === "glazing" && qaGlazingId) {
      const glazing = manifest.glazing.find((item) => item.id === qaGlazingId);
      const glazingWall = manifest.walls.find((item) => item.id === glazing?.wallId);
      const glazingRoom = manifest.rooms.find((item) => item.id === glazing?.roomId);
      if (glazing && glazingWall && glazingRoom) {
        const center = pointAlongWall(glazingWall, glazing.offset + glazing.width / 2, glazing.sill + glazing.height * 0.52);
        const inward = wallInteriorNormal(glazingWall, glazingRoom);
        const frame = wallFrame(glazingWall);
        const tangent = frame.tangent;
        const distance = Math.min(8.2, Math.max(2.4, glazing.width * 1.1));
        const sideSign = qaGlazingSide === "outside" ? -1 : 1;
        const angleOffset = qaGlazingSide === "angle" ? distance * 0.32 : 0;
        position = new THREE.Vector3(
          center.x + inward.x * distance * sideSign + tangent.x * angleOffset,
          Math.min(2.25, glazing.sill + glazing.height * 0.56),
          center.z + inward.y * distance * sideSign + tangent.y * angleOffset,
        );
        target = new THREE.Vector3(center.x, glazing.sill + glazing.height * 0.48, center.z);
      }
    }
    if (!position && viewPreset === "room" && room) {
      ({ position, target } = roomCamera(room));
    } else if (!position) {
      const selected = preset ?? presentationContract(manifest).presets.dollhouse;
      position = new THREE.Vector3().fromArray(selected.position);
      target = new THREE.Vector3().fromArray(selected.target);
    }
    runtime.cameraGoal.position = position;
    runtime.cameraGoal.target = target;
    runtime.cameraGoal.progress = 0;
  }, [viewPreset, selectedRoomId, manifest, qaGlazingId, qaGlazingSide]);

  return <div ref={hostRef} className="scene-viewport" data-mode={mode} />;
}

export default SmartHomeScene;
