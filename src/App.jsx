import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SlidersHorizontal } from "@phosphor-icons/react";
import {
  CameraToolbar,
  DebugPanel,
  DevicePanel,
  FlightHud,
  ModeSwitch,
  RoomRail,
  ScenarioBar,
  TopBar,
} from "./components/index.js";
import projectManifest from "./data/project-manifest-v2.js";
import { SmartHomeScene } from "./scene/SmartHomeScene.jsx";
import { validateManifest } from "./scene/manifestValidator.js";

const DEMO_ACK_MS = 520;
const CONFIRMED_MS = 1200;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

function initialQaState() {
  const params = new URLSearchParams(window.location.search);
  const preset = params.get("qa");
  const requestedRoomId = params.get("room");
  const requestedGlazingId = params.get("glazing");
  const glazing = projectManifest.glazing.find((item) => item.id === requestedGlazingId) ?? null;
  const glazingId = glazing?.id ?? null;
  const roomId = projectManifest.rooms.some((room) => room.id === requestedRoomId)
    ? requestedRoomId
    : glazing?.roomId ?? "kitchen-living";
  const glazingSide = ["inside", "outside", "angle"].includes(params.get("side")) ? params.get("side") : "angle";
  const overlayKind = ["plan", "light"].includes(params.get("overlay")) ? params.get("overlay") : null;
  return {
    viewPreset: glazingId ? "glazing" : (["top", "dollhouse", "glazing", "room"].includes(preset) ? preset : "dollhouse"),
    showUi: params.get("ui") !== "0",
    scenario: ["day", "evening", "away"].includes(params.get("scenario")) ? params.get("scenario") : "day",
    roomId,
    glazingId,
    glazingSide,
    overlayKind,
  };
}

function devicesForScenario(scenarioId) {
  const scenario = projectManifest.scenarios.find((item) => item.id === scenarioId) ?? projectManifest.scenarios[0];
  return projectManifest.devices.map((item) => {
    if (item.kind === "light") return { ...item, on: scenario.lightLevel > 0, level: scenario.lightLevel, state: "idle" };
    if (item.kind === "curtain") return { ...item, on: true, level: scenario.curtainLevel, state: "idle" };
    if (item.kind === "climate") return { ...item, on: true, level: scenario.climate, state: "idle" };
    return { ...item };
  });
}

function toUiDevice(device) {
  let control;
  if (device.kind === "light") {
    control = {
      type: "light",
      on: device.on,
      level: device.level,
      min: 0,
      max: 100,
      step: 1,
      powerAction: "toggle",
      levelAction: "setLevel",
    };
  } else if (device.kind === "curtain") {
    control = {
      type: "actions",
      options: [
        { id: "close", label: "Закрыть", action: "setLevel", value: 0 },
        { id: "half", label: "50%", action: "setLevel", value: 50 },
        { id: "open", label: "Открыть", action: "setLevel", value: 100 },
        { id: "stop", label: "Стоп", action: "stop", value: null },
      ],
    };
  } else {
    control = { type: "range", value: device.level, min: 16, max: 28, unit: "°", label: "Уставка", action: "setLevel" };
  }
  return {
    ...device,
    commandState: device.state,
    visualObjectId: device.visualId,
    detail: device.kind === "light"
      ? `${device.on ? `Яркость ${device.level}%` : "Выключено"} · группа`
      : device.kind === "curtain"
        ? `Открыто на ${device.level}%`
        : `${device.on ? "Поддержание" : "Выключено"} · demo`,
    control,
  };
}

export default function App() {
  const qa = useMemo(initialQaState, []);
  const manifestValidation = useMemo(() => validateManifest(projectManifest), []);
  const reducedMotion = useReducedMotion();
  const [mode, setMode] = useState("overview");
  const [selectedRoomId, setSelectedRoomId] = useState(qa.roomId);
  const [devices, setDevices] = useState(() => devicesForScenario(qa.scenario));
  const [scenarioId, setScenarioId] = useState(qa.scenario);
  const [pendingScenarioId, setPendingScenarioId] = useState(null);
  const [viewPreset, setViewPreset] = useState(qa.viewPreset);
  const [flightMode, setFlightMode] = useState(false);
  const [flightAction, setFlightAction] = useState(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [announcement, setAnnouncement] = useState("Демонстрационная панель готова");
  const [debugOpen, setDebugOpen] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [devicePanelCollapsed, setDevicePanelCollapsed] = useState(false);
  const [debugState, setDebugState] = useState({
    bounds: false,
    collisions: false,
    doorArcs: false,
    overlay: Boolean(qa.overlayKind),
    overlayKind: qa.overlayKind ?? "plan",
    overlayOpacity: 0.48,
  });
  const timersRef = useRef(new Set());
  const deviceTimersRef = useRef(new Map());

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const defer = useCallback((callback, delay) => {
    const timer = window.setTimeout(() => {
      timersRef.current.delete(timer);
      callback();
    }, delay);
    timersRef.current.add(timer);
    return timer;
  }, []);

  const selectedRoom = useMemo(
    () => projectManifest.rooms.find((room) => room.id === selectedRoomId) ?? null,
    [selectedRoomId],
  );
  const roomDevices = useMemo(
    () => devices.filter((device) => device.roomId === selectedRoomId).map(toUiDevice),
    [devices, selectedRoomId],
  );

  const selectRoom = useCallback((roomId) => {
    setSelectedRoomId(roomId);
    setViewPreset("room");
    setMode((current) => current === "devices" ? current : "rooms");
  }, []);

  const selectDevice = useCallback((deviceId) => {
    const device = devices.find((item) => item.id === deviceId);
    if (!device) return;
    setSelectedRoomId(device.roomId);
    setMode("devices");
    setDevicePanelCollapsed(false);
    setMobileControlsOpen(false);
    setAnnouncement(`Открыто управление: ${device.name}`);
  }, [devices]);

  const commandDevice = useCallback(({ deviceId, action, value }) => {
    const current = devices.find((item) => item.id === deviceId);
    const canReplacePendingRange =
      (current?.kind === "climate" || current?.kind === "light")
      && action === "setLevel";
    if (!current || current.state === "offline" || (current.state === "pending" && !canReplacePendingRange)) return;
    const previousTimer = deviceTimersRef.current.get(deviceId);
    if (previousTimer) {
      window.clearTimeout(previousTimer);
      timersRef.current.delete(previousTimer);
    }
    setDevices((items) => items.map((item) => item.id === deviceId ? {
      ...item,
      state: "pending",
      ...(canReplacePendingRange ? { level: Number(value) } : {}),
    } : item));
    setAnnouncement(`Команда «${current.name}» отправлена в демо-контур`);
    const acknowledgementTimer = defer(() => {
      setDevices((items) => items.map((item) => {
        if (item.id !== deviceId) return item;
        const next = { ...item, state: "confirmed" };
        if (action === "toggle") {
          next.on = Boolean(value);
          if (next.on && item.kind === "light" && Number(item.level) <= 0) next.level = 100;
        }
        if (action === "setLevel") {
          next.level = Number(value);
          next.on = item.kind === "light" ? Number(value) > 0 : true;
          delete next.motion;
        }
        if (action === "stop") next.motion = "stopped";
        return next;
      }));
      setAnnouncement(`Команда «${current.name}» подтверждена эмулятором`);
      const resetTimer = defer(() => {
        deviceTimersRef.current.delete(deviceId);
        setDevices((items) => items.map((item) => item.id === deviceId ? { ...item, state: "idle" } : item));
      }, CONFIRMED_MS);
      deviceTimersRef.current.set(deviceId, resetTimer);
    }, DEMO_ACK_MS);
    deviceTimersRef.current.set(deviceId, acknowledgementTimer);
  }, [defer, devices]);

  const applyScenario = useCallback((nextScenarioId) => {
    if (pendingScenarioId) return;
    const scenario = projectManifest.scenarios.find((item) => item.id === nextScenarioId);
    if (!scenario) return;
    setPendingScenarioId(nextScenarioId);
    setDevices((items) => items.map((item) => ({ ...item, state: item.state === "offline" ? "offline" : "pending" })));
    setAnnouncement(`Сценарий «${scenario.name}» отправлен в демо-контур`);
    defer(() => {
      setDevices((items) => items.map((item) => {
        if (item.state === "offline") return item;
        if (item.kind === "light") return { ...item, on: scenario.lightLevel > 0, level: scenario.lightLevel, state: "confirmed" };
        if (item.kind === "curtain") return { ...item, on: true, level: scenario.curtainLevel, motion: undefined, state: "confirmed" };
        if (item.kind === "climate") return { ...item, on: true, level: scenario.climate, state: "confirmed" };
        return { ...item, state: "confirmed" };
      }));
      setScenarioId(nextScenarioId);
      setPendingScenarioId(null);
      setAnnouncement(`Сценарий «${scenario.name}» подтверждён эмулятором`);
      defer(() => setDevices((items) => items.map((item) => item.state === "confirmed" ? { ...item, state: "idle" } : item)), CONFIRMED_MS);
    }, DEMO_ACK_MS + 120);
  }, [defer, pendingScenarioId]);

  const toggleDebug = useCallback((optionId, enabled) => {
    const key = optionId === "sourceOverlay" ? "overlay" : optionId;
    setDebugState((current) => ({ ...current, [key]: enabled, ...(optionId === "sourceOverlay" ? { overlayKind: "plan" } : {}) }));
    if (optionId === "sourceOverlay" && enabled) setViewPreset("top");
  }, []);

  const handleFlightMove = useCallback((direction, active) => {
    const normalized = direction === "backward" ? "back" : direction;
    setFlightAction({ id: performance.now(), direction: normalized, active });
  }, []);

  const roomsForUi = useMemo(() => projectManifest.rooms.map((room) => ({
    id: room.id,
    name: room.name,
    area: room.reportedArea,
    confidence: room.confidence,
  })), []);

  const changeMode = useCallback((next) => {
    setMode(next);
    setMobileControlsOpen(false);
    if (next === "overview") setViewPreset("dollhouse");
    if (next === "rooms") setViewPreset("room");
    if (next === "devices") setDevicePanelCollapsed(false);
  }, []);

  const presentationLayoutKey = `${mode}:${mobileControlsOpen}:${devicePanelCollapsed}`;

  const debugOptions = [
    { id: "bounds", label: "Границы объектов", enabled: debugState.bounds, description: "Bounding volumes мебели и стен" },
    { id: "doorArcs", label: "Дверные дуги", enabled: debugState.doorArcs, description: "Траектории открывания полотен" },
    { id: "collisions", label: "Коллизии", enabled: debugState.collisions, description: `Неразрешённых пересечений: ${manifestValidation.stats.unresolvedCollisions}` },
    { id: "sourceOverlay", label: "Наложение листа 4", enabled: debugState.overlay, description: "Физическая PDF-страница 24" },
  ];

  return (
    <main
      className="smart-home-app"
      data-mode={mode}
      data-flight-active={flightMode}
      data-ui-visible={qa.showUi}
      data-qa-view={viewPreset}
      data-qa-room={selectedRoomId}
      data-qa-glazing={qa.glazingId ?? ""}
      data-qa-side={qa.glazingSide}
      data-scenario={scenarioId}
      data-pending-scenario={pendingScenarioId ?? ""}
      data-validator-status={manifestValidation.ok ? "pass" : "fail"}
    >
      <div className="smart-home-stage">
        <SmartHomeScene
          manifest={projectManifest}
          devices={devices}
          mode={mode}
          selectedRoomId={selectedRoomId}
          onSelectRoom={selectRoom}
          onSelectDevice={selectDevice}
          scenarioId={scenarioId}
          viewPreset={viewPreset}
          debugState={debugState}
          flightMode={flightMode}
          onFlightModeChange={setFlightMode}
          flightAction={flightAction}
          reducedMotion={reducedMotion}
          qaGlazingId={qa.glazingId}
          qaGlazingSide={qa.glazingSide}
          collisionReport={manifestValidation}
          presentationLayoutKey={presentationLayoutKey}
          onReady={() => setSceneReady(true)}
        />
      </div>

      {!sceneReady ? <div className="ui-scene-loading" role="status">Собираю пространственную модель…</div> : null}

      {qa.showUi ? (
        <>
          <TopBar projectName={projectManifest.meta.title} subtitle={projectManifest.meta.subtitle} connectionStatus="demo" demoMode />
          <RoomRail rooms={roomsForUi} selectedRoomId={selectedRoomId} onSelectRoom={selectRoom} />
          <ModeSwitch value={mode} onChange={changeMode} />
          <button
            type="button"
            className="ui-mobile-controls-toggle"
            aria-controls="secondary-scene-controls"
            aria-expanded={mobileControlsOpen}
            aria-label={mobileControlsOpen ? "Скрыть сценарии и камеру" : "Показать сценарии и камеру"}
            onClick={() => setMobileControlsOpen((open) => !open)}
          >
            <SlidersHorizontal aria-hidden="true" size={19} />
            <span className="ui-visually-hidden">Сценарии и камера</span>
          </button>
          <DevicePanel
            room={selectedRoom}
            devices={roomDevices}
            onCommand={commandDevice}
            collapsed={devicePanelCollapsed}
            onCollapsedChange={setDevicePanelCollapsed}
            demoMode
            announcement={announcement}
            onClose={() => {
              setMode("rooms");
              setDevicePanelCollapsed(true);
            }}
          />
          <div
            id="secondary-scene-controls"
            className="ui-secondary-controls"
            data-mobile-open={mobileControlsOpen}
          >
            <ScenarioBar
              activeScenarioId={scenarioId}
              pendingScenarioId={pendingScenarioId}
              onSelect={(nextScenarioId) => {
                applyScenario(nextScenarioId);
                setMobileControlsOpen(false);
              }}
            />
            <CameraToolbar
              value={viewPreset}
              onChange={(preset) => {
                setFlightMode(false);
                setViewPreset(preset);
                setMobileControlsOpen(false);
              }}
              onFlight={() => {
                setMobileControlsOpen(false);
                setFlightMode(true);
              }}
              flightMode={flightMode}
            />
          </div>
          <DebugPanel
            open={debugOpen}
            onOpenChange={setDebugOpen}
            options={debugOptions}
            onToggle={toggleDebug}
            collisions={manifestValidation.errors.map((issue, index) => ({
              id: `${issue.code}-${index}`,
              label: issue.code,
              detail: issue.message,
              severity: "error",
            }))}
            validatorStatus={!manifestValidation.ok ? "error" : manifestValidation.warnings.length > 0 ? "warning" : "valid"}
            sourceOverlayOpacity={debugState.overlayOpacity}
            onSourceOverlayOpacityChange={(overlayOpacity) => setDebugState((current) => ({ ...current, overlayOpacity }))}
          />
          <FlightHud active={flightMode} onExit={() => setFlightMode(false)} onMove={handleFlightMove} />
          <div className="ui-scene-caption" aria-hidden="true">
            <span>157,59 м²</span>
            <span>Лист 4 · PDF 24</span>
            <span>Контур provisional</span>
          </div>
          <span className="ui-visually-hidden" role="status" aria-live="polite">
            {announcement}
          </span>
        </>
      ) : null}
    </main>
  );
}
