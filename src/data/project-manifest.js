const PDF_FILE = "Дизайн-проект интерьера.pdf";

const source = (sheet, pdfPage, note = undefined) => ({
  file: PDF_FILE,
  sheet,
  pdfPage,
  ...(note ? { note } : {}),
});

const fixturePoint = (id, x, z, extra = {}) => ({ id, position: [x, z], ...extra });

const linearFixture = (id, start, end) => {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length = Math.hypot(dx, dz);
  return fixturePoint(id, (start[0] + end[0]) / 2, (start[1] + end[1]) / 2, {
    kind: "linear",
    length,
    rotationY: -Math.atan2(dz, dx),
    size: [length, 0.05, 0.07],
    segment: { start, end },
  });
};

const radialCollisionParts = (count, radiusX, radiusZ, size) => Array.from(
  { length: count },
  (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return {
      id: `seat-${String(index + 1).padStart(2, "0")}`,
      offset: [Math.sin(angle) * radiusX, 0, Math.cos(angle) * radiusZ],
      size,
      rotationY: angle + Math.PI,
    };
  },
);

const fixtureGroup = ({ id, roomId, deviceId, kind = "downlight", points, rails = undefined, height, maxIntensity, group, sourceRef }) => ({
  id,
  roomId,
  deviceId,
  kind,
  group,
  maxIntensity,
  height,
  ...(rails ? { rails } : {}),
  fixtures: points.map((point, index) => {
    const descriptor = Array.isArray(point) ? { position: point } : point;
    return {
      id: descriptor.id ? `${id}-${descriptor.id}` : `${id}-${String(index + 1).padStart(2, "0")}`,
      position: [descriptor.position[0], height, descriptor.position[1]],
      ...(descriptor.kind ? { kind: descriptor.kind } : {}),
      ...(Number.isFinite(descriptor.length) ? { length: descriptor.length } : {}),
      ...(Number.isFinite(descriptor.rotationY) ? { rotationY: descriptor.rotationY } : {}),
      ...(descriptor.size ? { size: descriptor.size } : {}),
      ...(descriptor.segment ? { segment: descriptor.segment } : {}),
      source: sourceRef,
      sourceRefs: [sourceRef, SRC.lights, SRC.lightSchedule],
      confidence: "provisional",
      parameterConfidence: { symbolCount: "confirmed", positionXZ: "provisional", heightY: "provisional", symbolKind: descriptor.kind ? "provisional" : "confirmed" },
    };
  }),
  source: sourceRef,
  sourceRefs: [sourceRef, SRC.lights, SRC.switches, SRC.lightSchedule],
  confidence: "provisional",
  parameterConfidence: { symbolCount: "confirmed", positionXZ: "provisional", heightY: "provisional", grouping: "provisional", maxIntensity: "provisional" },
});

const SRC = {
  survey: source("Лист 2 — План обмеров", 22),
  topology: source("Лист 4 — План после перепланировки", 24),
  doors: source("Лист 5 — План дверных проёмов", 25),
  furniture: source("Лист 6 — План с размещением мебели и оборудования", 26),
  heating: source("Лист 9 — План отопления", 29),
  ceiling: source("Лист 10 — План потолков", 30),
  lights: source("Лист 11 — План с размещением светильников", 31),
  generatedLights: {
    file: "image-1784577282303.jpg",
    sheet: "Сгенерированный план освещения — подтверждение количества по помещениям",
    pdfPage: 1,
    note: "Отдельный JPG; pdfPage=1 означает единственный лист изображения. Пользователь подтвердил источник 21.07.2026. Количество и относительная раскладка подтверждены, метрическая X/Z-регистрация остаётся provisional.",
  },
  switches: source("Лист 12 — План выключателей", 32),
  controls: source("Лист 14 — План электровыводов", 34),
  floorPlan: source("Лист 8 — План напольных покрытий", 28),
  finishes: source("Лист 15 — План отделочных материалов", 35),
  finishSchedule: source("Лист 29 — Ведомость отделки помещений", 50, "Диапазон физических страниц 50–54"),
  elevations: source("Листы 16–29 — Развёртки стен", 36, "Диапазон физических страниц 36–49"),
  elevationLiving: source("Лист 18 — Развёртки гостиной и столовой", 38),
  elevationMasterBedroom: source("Лист 22 — Развёртки мастер-спальни", 42),
  elevationWardrobe: source("Лист 23 — Развёртки гардеробной", 43),
  elevationMasterBath: source("Лист 24 — Развёртки мастер-ванной", 44),
  elevationGuestBedroom: source("Лист 25 — Развёртки гостевой спальни", 46),
  furnitureSchedule: source("Лист 38 — Ведомость мебели и оборудования", 59, "Диапазон физических страниц 59–60"),
  lightSchedule: source("Лист 34 — Ведомость светильников", 55, "Диапазон физических страниц 55–56"),
  renders: source("Фотореалистичные изображения — начало раздела", 3, "Материалы и атмосфера; диапазон физических страниц 3–21"),
};

const LIGHT_VISUAL_BY_DEVICE = {
  "device-light-master": "light-master-grid",
  "device-light-master-pendant": "light-master-pendant",
  "device-light-master-bath": "light-master-bath-grid",
  "device-light-wardrobe": "light-wardrobe-grid",
  "device-light-corridor": "light-corridor",
  "device-light-guest-wc": "light-guest-wc",
  "device-light-guest": "light-guest-grid",
  "device-light-guest-bath": "light-guest-bath",
  "device-light-hall": "light-hall",
  "device-light-laundry": "light-laundry",
  "device-light-living": "light-living-linear",
  "device-light-track": "light-living-track",
  "device-light-dining": "light-dining-pendant",
};

const room = (id, name, number, area, polygon, ceilingHeight, floorMaterial, focus) => ({
  id,
  name,
  number,
  reportedArea: area,
  polygon,
  ceilingHeight,
  floorMaterial,
  focus,
  source: SRC.topology,
  confidence: "provisional",
  parameterConfidence: { reportedArea: "confirmed", polygon: "provisional", ceilingHeight: "confirmed" },
});

const wall = (id, start, end, height = 3.405, thickness = 0.2, confidence = "provisional") => ({
  id,
  start,
  end,
  height,
  thickness,
  materialId: "wall-warm-greige",
  source: SRC.topology,
  sourceRefs: [SRC.topology, SRC.ceiling],
  confidence,
  parameterConfidence: { centerlineXZ: "provisional", height: "confirmed", thickness: "provisional" },
});

const furniture = (id, roomId, kind, position, size, rotationY, materialId, confidence = "proxy", extra = {}) => ({
  id,
  roomId,
  kind,
  position,
  size,
  rotationY,
  materialId,
  source: SRC.furniture,
  sourceRefs: [SRC.furniture, SRC.furnitureSchedule, SRC.renders],
  confidence,
  ...extra,
});

export const projectManifest = {
  meta: {
    id: "kokos-iv-apartment",
    title: "КОКОС IV",
    subtitle: "Пространственная панель",
    version: "0.1.0",
    mode: "demo",
    units: "m",
    totalReportedArea: 157.59,
    sourcePdfPhysicalPages: 60,
    generatedAt: "2026-07-20",
  },

  coordinateSystem: {
    floorPlane: "X/Z",
    verticalAxis: "Y",
    origin: "Внутренний северо-западный угол мастер-спальни на листе 4",
    north: "-Z",
    scale: 1,
    source: SRC.topology,
    confidence: "provisional",
  },

  sources: Object.values(SRC),

  shell: {
    id: "apartment-shell",
    exterior: [
      [-0.3, -0.3], [6.785, -0.3], [6.785, -0.2], [17.98, -0.2],
      [17.98, 7.405], [9.46, 7.405], [9.46, 12.245], [6.25, 12.245],
      [-0.3, 12.245],
    ],
    rawSlabHeight: 3.655,
    source: SRC.survey,
    confidence: "provisional",
    note: "Глобальная размерная цепь отсутствует; контур оцифрован по растровой подложке с локальной калибровкой.",
  },

  rooms: [
    room("master-bedroom", "Мастер-спальня", "01", 17.50, [[0, 0], [3.81, 0], [3.81, 4.595], [0, 4.595]], 3.405, "oak-edinburgh", [1.9, 0.4, 2.25]),
    room("master-bath", "Мастер-ванная", "02", 11.80, [[3.81, 0], [6.365, 0], [6.365, 4.485], [5.89, 4.485], [5.89, 4.595], [3.81, 4.595]], 3.305, "stone-calacatta", [5.05, 0.35, 2.2]),
    room("wardrobe", "Гардеробная", "03", 7.12, [[0, 4.595], [2.689, 4.595], [2.689, 7.245], [0, 7.245]], 3.265, "oak-edinburgh", [1.35, 0.35, 5.9]),
    room("corridor", "Коридор", "04", 9.47, [[2.689, 4.595], [6.485, 4.595], [6.485, 6.884], [5.11, 6.884], [5.11, 7.485], [3.81, 7.485], [3.81, 6.884], [2.689, 6.884]], 3.405, "oak-edinburgh", [4.5, 0.35, 5.9]),
    room("guest-wc", "Гостевой санузел", "05", 2.98, [[3.81, 7.715], [5.61, 7.715], [5.61, 9.37], [3.81, 9.37]], 3.305, "stone-calce", [4.7, 0.3, 8.5]),
    room("guest-bedroom", "Гостевая спальня", "06", 16.99, [[0, 7.485], [3.81, 7.485], [3.81, 11.945], [0, 11.945]], 3.405, "oak-edinburgh", [1.9, 0.4, 9.7]),
    room("guest-bath", "Гостевая ванная", "07", 7.29, [[3.81, 9.37], [6.55, 9.37], [6.55, 10.7725], [6.75, 10.7725], [6.75, 11.945], [3.81, 11.945]], 3.305, "stone-cristallo", [5.15, 0.3, 10.65]),
    room("hall", "Холл", "08", 8.72, [[6, 7.145], [9.16, 7.145], [9.16, 8.65], [8.15, 8.65], [8.15, 11.945], [6.95, 11.945], [6.95, 8.65], [6, 8.65]], 3.405, "charcoal-entrance", [7.6, 0.3, 8.3]),
    room("laundry", "Постирочная", "09", 4.62, [[7, 0], [8.425, 0], [8.425, 3.245], [7, 3.245]], 3.305, "stone-calce", [7.7, 0.3, 1.6]),
    room("kitchen-living", "Кухня · гостиная · столовая", "10", 71.10, [[8.425, 0], [17.53, 0], [17.53, 7.105], [9.16, 7.105], [9.16, 7.145], [6.485, 7.145], [6.485, 5.555], [7, 5.555], [7, 3.245], [8.425, 3.245]], 3.405, "oak-edinburgh", [13.2, 0.5, 3.6]),
  ],

  walls: [
    wall("wall-left-north", [0, -0.15], [6.485, -0.15], 3.405, 0.3),
    wall("wall-left-west", [-0.15, 0], [-0.15, 11.945], 3.405, 0.3),
    wall("wall-left-south", [0, 12.095], [6.55, 12.095], 3.405, 0.3),
    wall("wall-right-north", [6.485, -0.15], [17.68, -0.15], 3.405, 0.3),
    wall("wall-right-east", [17.83, 0], [17.83, 7.105], 3.405, 0.3),
    wall("wall-right-south", [9.16, 7.255], [17.68, 7.255], 3.405, 0.3),
    wall("wall-entry-east", [9.16, 7.105], [9.16, 11.945], 3.405, 0.3),
    wall("wall-entry-south", [6.55, 12.095], [9.16, 12.095], 3.405, 0.3),
    wall("wall-master-bath", [3.81, 0], [3.81, 4.595], 3.405, 0.12),
    wall("wall-master-south", [0, 4.595], [3.81, 4.595], 3.405, 0.12),
    wall("wall-bath-south", [3.81, 4.595], [6.485, 4.595], 3.405, 0.12),
    wall("wall-wardrobe-east", [2.749, 4.595], [2.749, 7.305], 3.405, 0.12),
    wall("wall-wardrobe-south", [0, 7.305], [2.86, 7.305], 3.405, 0.12),
    wall("wall-guest-north", [0, 7.485], [3.81, 7.485], 3.405, 0.12),
    wall("wall-guest-bath", [3.81, 9.37], [3.81, 11.945], 3.405, 0.12),
    wall("wall-guest-wc-west", [3.81, 7.715], [3.81, 9.285], 3.405, 0.12),
    wall("wall-guest-wc-north", [3.81, 7.715], [5.61, 7.715], 3.405, 0.12),
    wall("wall-guest-wc-east", [5.61, 7.715], [5.61, 9.37], 3.405, 0.12),
    wall("wall-guest-bath-north", [3.81, 9.37], [6.55, 9.37], 3.405, 0.12),
    wall("wall-laundry-west", [7, 0], [7, 3.245], 3.305, 0.12),
    wall("wall-laundry-east", [8.425, 0], [8.425, 3.245], 3.305, 0.12),
    wall("wall-laundry-south", [7, 3.245], [8.425, 3.245], 3.305, 0.12),
    wall("wall-living-jog-a", [7, 3.245], [7, 5.555], 3.405, 0.12),
    wall("wall-living-jog-b", [6.485, 5.555], [7, 5.555], 3.405, 0.12),
  ],

  doors: [
    { id: "door-entry", roomId: "hall", connects: ["hall", "outside"], wallId: "wall-entry-south", offset: 0.85, width: 1.6, height: 2.47, leafWidth: 1, leafWidths: [1, 0.5], leafCount: 2, hinge: "outer", swing: 1, source: SRC.doors, confidence: "provisional", parameterConfidence: { width: "confirmed", height: "confirmed", leaves: "confirmed", offsetXZ: "provisional" } },
    { id: "door-guest-wc", roomId: "guest-wc", connects: ["corridor", "guest-wc"], wallId: "wall-guest-wc-north", offset: 0.59, width: 0.8, height: 3.37, leafWidth: 0.8, leafCount: 1, hinge: "end", swing: -1, source: SRC.doors, confidence: "provisional", parameterConfidence: { width: "confirmed", height: "confirmed", leaves: "confirmed", offsetXZ: "provisional" } },
    { id: "door-guest-bedroom", roomId: "guest-bedroom", connects: ["corridor", "guest-bedroom"], wallId: "wall-guest-north", offset: 2.86, width: 0.9, height: 3.37, leafWidth: 0.8, leafCount: 1, hinge: "end", swing: 1, source: SRC.doors, confidence: "provisional", parameterConfidence: { width: "confirmed", height: "confirmed", leaves: "confirmed", offsetXZ: "provisional" } },
    { id: "door-guest-bath", roomId: "guest-bath", connects: ["guest-bedroom", "guest-bath"], wallId: "wall-guest-bath", offset: 0.79, width: 0.8, height: 3.37, leafWidth: 0.8, leafCount: 1, hinge: "end", swing: 1, source: SRC.doors, confidence: "provisional", parameterConfidence: { width: "confirmed", height: "confirmed", leaves: "confirmed", offsetXZ: "provisional" } },
    { id: "door-master-bedroom", roomId: "master-bedroom", connects: ["corridor", "master-bedroom"], wallId: "wall-master-south", offset: 2.69, width: 0.9, height: 3.37, leafWidth: 0.8, leafCount: 1, hinge: "end", swing: 1, source: SRC.doors, confidence: "provisional", parameterConfidence: { width: "confirmed", height: "confirmed", leaves: "confirmed", offsetXZ: "provisional" } },
    { id: "door-master-wardrobe", roomId: "master-bedroom", connects: ["master-bedroom", "wardrobe"], wallId: "wall-master-south", offset: 1.09, width: 0.9, height: 3.315, leafWidth: 0.8, leafCount: 1, hinge: "start", swing: -1, source: SRC.doors, confidence: "provisional", parameterConfidence: { width: "confirmed", height: "confirmed", leaves: "confirmed", offsetXZ: "provisional" } },
    { id: "door-master-bath", roomId: "master-bath", connects: ["master-bedroom", "master-bath"], wallId: "wall-master-bath", offset: 2.835, width: 0.8, height: 3.38, leafWidth: 0.7, leafCount: 1, hinge: "start", swing: 1, source: SRC.doors, confidence: "provisional", parameterConfidence: { width: "confirmed", height: "confirmed", leaves: "confirmed", offsetXZ: "provisional" } },
  ],

  glazing: [
    { id: "glazing-master-north", roomId: "master-bedroom", wallId: "wall-left-north", offset: 0.21, width: 2.765, height: 3.115, sill: 0.15, sections: null, frameWidth: 0.055, frameDepth: 0.08, glassThickness: 0.012, operable: null, profile: "black", glass: "clear", curtainDeviceId: "curtain-master", source: SRC.survey, sourceRefs: [SRC.survey, SRC.elevationMasterBedroom], confidence: "provisional", assumption: "Неразделённый proxy; разбивка и створки не показаны в приоритетных планах." },
    { id: "glazing-master-bath-north", roomId: "master-bath", wallId: "wall-left-north", offset: 3.96, width: 1.765, height: 3.115, sill: 0.15, sections: null, frameWidth: 0.055, frameDepth: 0.08, glassThickness: 0.012, operable: null, profile: "black", glass: "clear", curtainDeviceId: null, source: SRC.survey, sourceRefs: [SRC.survey, SRC.elevationMasterBath], confidence: "provisional", assumption: "Неразделённый proxy; разбивка и створки не показаны в приоритетных планах." },
    { id: "glazing-wardrobe-west", roomId: "wardrobe", wallId: "wall-left-west", offset: 4.595, width: 1.775, height: 3.115, sill: 0.15, sections: null, frameWidth: 0.055, frameDepth: 0.08, glassThickness: 0.012, operable: null, profile: "black", glass: "clear", curtainDeviceId: null, source: SRC.survey, sourceRefs: [SRC.survey, SRC.elevationWardrobe], confidence: "provisional", assumption: "Ширина 1,775 м принята по листу 2; на одной развёртке читается конфликтующая локальная величина 0,945 м." },
    { id: "glazing-guest-west", roomId: "guest-bedroom", wallId: "wall-left-west", offset: 7.485, width: 1.76, height: 3.115, sill: 0.15, sections: null, frameWidth: 0.055, frameDepth: 0.08, glassThickness: 0.012, operable: null, profile: "black", glass: "clear", curtainDeviceId: "curtain-guest", source: SRC.survey, sourceRefs: [SRC.survey, SRC.elevationGuestBedroom], confidence: "provisional", assumption: "Положение привязано к северной грани гостевой спальни; разбивка и створки не подтверждены." },
    { id: "glazing-living-north-main", roomId: "kitchen-living", wallId: "wall-right-north", offset: 1.94, width: 5.458, height: 3.115, sill: 0.15, sections: null, frameWidth: 0.055, frameDepth: 0.08, glassThickness: 0.012, operable: null, profile: "black", glass: "clear", curtainDeviceId: "curtain-living-north", source: SRC.survey, sourceRefs: [SRC.survey, SRC.elevationLiving], confidence: "provisional", assumption: "Начало совмещено с восточной гранью постирочной по листам 2/4; разбивка и створки не подтверждены." },
    { id: "glazing-living-north-fireplace", roomId: "kitchen-living", wallId: "wall-right-north", offset: 8.203, width: 2.99, height: 3.115, sill: 0.15, sections: null, frameWidth: 0.055, frameDepth: 0.08, glassThickness: 0.012, operable: null, profile: "black", glass: "clear", curtainDeviceId: null, source: SRC.survey, sourceRefs: [SRC.survey, SRC.elevationLiving], confidence: "provisional", assumption: "Неразделённый proxy; разбивка и створки не показаны в приоритетных планах." },
    { id: "glazing-living-east", roomId: "kitchen-living", wallId: "wall-right-east", offset: 0.25, width: 6.855, height: 3.115, sill: 0.15, sections: null, frameWidth: 0.055, frameDepth: 0.08, glassThickness: 0.012, operable: null, profile: "black", glass: "clear", curtainDeviceId: "curtain-living-east", source: SRC.survey, sourceRefs: [SRC.survey, SRC.elevationLiving], confidence: "provisional", assumption: "Непрерывный проём 6,855 м; соседние 0,745 м — глухой участок стены." },
  ],

  openPassages: [
    { id: "passage-corridor-living", roomId: "corridor", wallId: "wall-bath-south", offset: 1.94, width: 0.7, height: 3.405, source: SRC.topology, confidence: "provisional" },
    { id: "passage-hall-living", roomId: "hall", wallId: "wall-entry-east", offset: 0.25, width: 1.4, height: 3.405, source: SRC.topology, confidence: "provisional" },
  ],

  furniture: [
    furniture("master-bed-main", "master-bedroom", "bed", [1.62, 0, 2.45], [2.23, 1.11, 2.18], 0, "textile-warm", "proxy"),
    furniture("master-chair", "master-bedroom", "chair", [2.95, 0, 0.75], [0.97, 0.77, 1], 0, "textile-olive", "proxy"),
    furniture("master-tub", "master-bath", "bathtub", [4.86, 0, 0.67], [1.7, 0.56, 0.86], 0, "sanitary-white", "proxy"),
    furniture("master-vanity", "master-bath", "vanity", [5.45, 0, 2.25], [0.55, 0.85, 1.5], Math.PI / 2, "stone-calacatta", "proxy"),
    furniture("master-shower", "master-bath", "shower", [5.45, 0, 3.82], [1.4, 2.1, 0.78], 0, "glass-clear", "proxy"),
    furniture("wardrobe-system", "wardrobe", "cabinet", [1.345, 0, 6.82], [2.65, 3.19, 0.6], 0, "oak-dark", "proxy"),
    furniture("guest-sofa", "guest-bedroom", "sofa", [1.42, 0, 8.18], [1.8, 0.86, 1], 0, "textile-olive", "proxy"),
    furniture("guest-bed-main", "guest-bedroom", "bed", [1.6, 0, 10.55], [1.9, 1.05, 2.15], 0, "textile-warm", "proxy"),
    furniture("guest-cabinet", "guest-bedroom", "cabinet", [3.15, 0, 11.67], [1.2, 3.385, 0.55], 0, "oak-dark", "proxy", { allowedContacts: ["wall-guest-bath", "wall-left-south"] }),
    furniture("guest-bath-tub", "guest-bath", "bathtub", [5.97, 0, 10.82], [1.7, 0.56, 0.86], Math.PI / 2, "sanitary-white", "proxy"),
    furniture("guest-bath-vanity", "guest-bath", "vanity", [4.52, 0, 9.68], [1.3, 0.85, 0.5], 0, "stone-cristallo", "proxy"),
    furniture("guest-bath-shower", "guest-bath", "shower", [4.42, 0, 11.42], [0.9, 2.1, 0.8], 0, "glass-clear", "proxy"),
    furniture("guest-wc-vanity", "guest-wc", "vanity", [4.18, 0, 8.6], [0.5, 0.75, 1.2], 0, "stone-calce", "proxy"),
    furniture("laundry-cabinet", "laundry", "cabinet", [7.42, 0, 1.62], [0.7, 3.23, 3.1], 0, "oak-dark", "proxy", { allowedContacts: ["wall-laundry-west", "wall-right-north"] }),
    furniture("dining-table", "kitchen-living", "round-table", [10.72, 0, 2.05], [1.4, 0.75, 1.4], 0, "oak-dark", "proxy", {
      collider: false,
      collisionParts: [
        { id: "disc-center", offset: [0, 0, 0], size: [1.4, 0.75, 0.28], rotationY: 0 },
        { id: "disc-north-mid", offset: [0, 0, -0.28], size: [1.28, 0.75, 0.28], rotationY: 0 },
        { id: "disc-south-mid", offset: [0, 0, 0.28], size: [1.28, 0.75, 0.28], rotationY: 0 },
        { id: "disc-north-edge", offset: [0, 0, -0.56], size: [0.7, 0.75, 0.28], rotationY: 0 },
        { id: "disc-south-edge", offset: [0, 0, 0.56], size: [0.7, 0.75, 0.28], rotationY: 0 },
      ],
    }),
    furniture("dining-chair-ring", "kitchen-living", "chair-ring", [10.72, 0, 2.05], [2.9, 0.78, 2.9], 0, "textile-warm", "proxy", {
      collider: false,
      count: 8,
      collisionParts: radialCollisionParts(8, 1.089, 1.089, [0.48, 0.78, 0.54]),
    }),
    furniture("kitchen-island", "kitchen-living", "island", [10.85, 0, 5.18], [2, 0.9, 1.2], 0, "stone-statuario", "proxy"),
    furniture("island-stools", "kitchen-living", "stool-row", [10.85, 0, 4.32], [2, 0.93, 0.48], 0, "oak-dark", "proxy", {
      collider: false,
      count: 3,
      collisionParts: [
        { id: "stool-01", offset: [-0.79, 0, 0], size: [0.42, 0.93, 0.48], rotationY: 0 },
        { id: "stool-02", offset: [0, 0, 0], size: [0.42, 0.93, 0.48], rotationY: 0 },
        { id: "stool-03", offset: [0.79, 0, 0], size: [0.42, 0.93, 0.48], rotationY: 0 },
      ],
    }),
    furniture("kitchen-run", "kitchen-living", "kitchen", [13.97, 0, 6.55], [4.935, 3.1, 0.74], 0, "oak-dark", "proxy"),
    furniture("living-sofa", "kitchen-living", "sectional-sofa", [15.1, 0, 4.25], [4.2, 0.82, 3.14], 0, "textile-ink", "proxy", {
      collider: false,
      collisionParts: [
        { id: "sofa-main", offset: [0, 0, 1.16], size: [4.2, 0.82, 0.82], rotationY: 0 },
        { id: "sofa-return", offset: [1.525, 0, 0], size: [1.15, 0.82, 3.14], rotationY: 0 },
      ],
    }),
    furniture("living-coffee-table", "kitchen-living", "coffee-table", [14.35, 0, 3.9], [1.88, 0.37, 1.2], 0.12, "stone-statuario", "proxy"),
    furniture("living-lounge-chair", "kitchen-living", "chair", [16.0, 0, 1.15], [0.78, 0.93, 0.84], -0.65, "textile-olive", "proxy"),
    furniture("living-fireplace", "kitchen-living", "fireplace", [14.6, 0, 0.66], [1.45, 1.25, 0.65], 0, "stone-statuario", "proxy"),
    furniture("hall-cabinet-main", "hall", "cabinet", [7.55, 0, 7.52], [2.675, 3.3, 0.6], 0, "oak-dark", "proxy"),
    furniture("hall-bench", "hall", "bench", [7.55, 0, 9.2], [1.1, 0.48, 0.45], 0, "textile-olive", "proxy"),
  ],

  unplacedItems: [
    {
      id: "master-bench-unplaced",
      roomId: "master-bedroom",
      kind: "bench",
      size: [1.1, 0.4, 0.4],
      source: SRC.furniture,
      confidence: "provisional",
      reason: "Габарит подтверждён ведомостью на листе 6, но точная позиция неразличима на плане; объект не помещён в сцену.",
    },
    {
      id: "hall-cabinet-secondary-unplaced",
      roomId: "hall",
      kind: "cabinet",
      size: [1.685, 3.3, 0.6],
      source: SRC.furniture,
      confidence: "provisional",
      reason: "Габарит подтверждён листом 6, но привязка к оцифрованному контуру недостаточно надёжна; объект не помещён в сцену.",
    },
  ],

  lights: [
    fixtureGroup({
      id: "light-master-grid",
      roomId: "master-bedroom",
      deviceId: "device-light-master",
      points: [
        fixturePoint("spot-01", 0.429, 0.602), fixturePoint("spot-02", 1.685, 0.597), fixturePoint("spot-03", 3.033, 0.599),
        fixturePoint("spot-04", 0.428, 3.649), fixturePoint("spot-05", 1.689, 3.651), fixturePoint("spot-06", 3.033, 3.651),
        linearFixture("linear-01", [0.1, 4.38], [0.882, 4.38]),
      ],
      height: 3.28,
      maxIntensity: 2.4,
      group: "master-ceiling",
      sourceRef: SRC.generatedLights,
    }),
    fixtureGroup({ id: "light-master-pendant", roomId: "master-bedroom", deviceId: "device-light-master-pendant", kind: "pendant", points: [fixturePoint("decorative-01", 1.757, 2.197)], height: 2.25, maxIntensity: 1.7, group: "master-decorative", sourceRef: SRC.generatedLights }),
    fixtureGroup({
      id: "light-master-bath-grid",
      roomId: "master-bath",
      deviceId: "device-light-master-bath",
      points: [
        fixturePoint("spot-01", 4.432, 0.628), fixturePoint("spot-02", 5.836, 0.63),
        fixturePoint("spot-03", 4.433, 3.881), fixturePoint("spot-04", 5.833, 3.882),
        fixturePoint("decorative-01", 5.127, 2.08, { kind: "surface", size: [0.46, 0.06, 0.46] }),
      ],
      height: 3.18,
      maxIntensity: 1.8,
      group: "master-bath-ceiling",
      sourceRef: SRC.generatedLights,
    }),
    fixtureGroup({
      id: "light-wardrobe-grid",
      roomId: "wardrobe",
      deviceId: "device-light-wardrobe",
      points: [
        fixturePoint("spot-01", 0.55, 5.123), fixturePoint("spot-02", 1.486, 5.122),
        fixturePoint("spot-03", 0.551, 5.989), fixturePoint("spot-04", 1.484, 5.991),
        linearFixture("linear-01", [2.588, 5.832], [2.588, 7.036]),
        linearFixture("linear-02", [0.101, 7.044], [2.034, 7.044]),
      ],
      height: 3.14,
      maxIntensity: 1.5,
      group: "wardrobe-ceiling",
      sourceRef: SRC.generatedLights,
    }),
    fixtureGroup({
      id: "light-corridor",
      roomId: "corridor",
      deviceId: "device-light-corridor",
      points: [fixturePoint("spot-01", 3.423, 5.964), fixturePoint("spot-02", 4.526, 5.963), fixturePoint("spot-03", 5.617, 5.963)],
      height: 3.28,
      maxIntensity: 1.2,
      group: "common-yeso",
      sourceRef: SRC.generatedLights,
    }),
    fixtureGroup({
      id: "light-guest-wc",
      roomId: "guest-wc",
      deviceId: "device-light-guest-wc",
      kind: "linear",
      points: [linearFixture("linear-01", [5.48, 7.9], [5.48, 9.18])],
      height: 3.18,
      maxIntensity: 0.9,
      group: "guest-wc-linear",
      sourceRef: SRC.generatedLights,
    }),
    fixtureGroup({
      id: "light-guest-grid",
      roomId: "guest-bedroom",
      deviceId: "device-light-guest",
      points: [
        fixturePoint("spot-01", 0.439, 8.107), fixturePoint("spot-02", 1.671, 8.113), fixturePoint("spot-03", 2.919, 8.107),
        fixturePoint("spot-04", 0.439, 9.63), fixturePoint("spot-05", 1.671, 9.63), fixturePoint("spot-06", 2.921, 9.628),
        fixturePoint("spot-07", 0.442, 11.185), fixturePoint("spot-08", 1.667, 11.184), fixturePoint("spot-09", 2.921, 11.18),
      ],
      height: 3.28,
      maxIntensity: 2.3,
      group: "guest-ceiling",
      sourceRef: SRC.generatedLights,
    }),
    fixtureGroup({
      id: "light-guest-bath",
      roomId: "guest-bath",
      deviceId: "device-light-guest-bath",
      points: [
        fixturePoint("spot-01", 4.394, 9.784), fixturePoint("spot-02", 6.119, 9.783),
        fixturePoint("spot-03", 4.393, 11.346), fixturePoint("spot-04", 6.116, 11.347),
        linearFixture("linear-01", [4.607, 11.767], [5.918, 11.767]),
      ],
      height: 3.18,
      maxIntensity: 1.5,
      group: "guest-bath-ceiling",
      sourceRef: SRC.generatedLights,
    }),
    fixtureGroup({
      id: "light-hall",
      roomId: "hall",
      deviceId: "device-light-hall",
      points: [fixturePoint("spot-01", 7.6, 7.25), fixturePoint("spot-02", 7.6, 7.9), fixturePoint("spot-03", 7.6, 8.55)],
      height: 3.28,
      maxIntensity: 1.1,
      group: "common-yeso",
      sourceRef: SRC.generatedLights,
    }),
    fixtureGroup({
      id: "light-laundry",
      roomId: "laundry",
      deviceId: "device-light-laundry",
      points: [
        fixturePoint("spot-01", 7.685, 0.823), fixturePoint("spot-02", 7.683, 1.572), fixturePoint("spot-03", 7.683, 2.308),
        linearFixture("linear-01", [7.304, 3.1], [8.093, 3.1]),
      ],
      height: 3.18,
      maxIntensity: 1.1,
      group: "laundry-ceiling",
      sourceRef: SRC.generatedLights,
    }),
    fixtureGroup({
      id: "light-living-linear",
      roomId: "kitchen-living",
      deviceId: "device-light-living",
      kind: "linear",
      points: [
        linearFixture("linear-01", [10.119, 4.868], [11.357, 4.868]),
        linearFixture("linear-02", [9.281, 6.083], [11.94, 6.083]),
        linearFixture("linear-03", [12.413, 6.083], [17.093, 6.083]),
        linearFixture("linear-04", [9.955, 6.869], [11.065, 6.869]),
        linearFixture("linear-05", [12.413, 6.869], [17.166, 6.869]),
      ],
      height: 3.16,
      maxIntensity: 1.7,
      group: "living-linear",
      sourceRef: SRC.generatedLights,
    }),
    fixtureGroup({
      id: "light-living-track",
      roomId: "kitchen-living",
      deviceId: "device-light-track",
      kind: "track",
      points: [
        fixturePoint("spot-01", 12.568, 1.511), fixturePoint("spot-02", 14.351, 1.511), fixturePoint("spot-03", 16.06, 1.511),
        fixturePoint("spot-04", 12.57, 3.194), fixturePoint("spot-05", 14.347, 3.194), fixturePoint("spot-06", 16.062, 3.194),
        fixturePoint("spot-07", 12.568, 4.896), fixturePoint("spot-08", 14.352, 4.896), fixturePoint("spot-09", 16.062, 4.898),
      ],
      rails: [
        { start: [12.568, 1.511], end: [16.06, 1.511] }, { start: [12.57, 3.194], end: [16.062, 3.194] }, { start: [12.568, 4.896], end: [16.062, 4.898] },
        { start: [12.568, 1.511], end: [12.568, 4.896] }, { start: [14.351, 1.511], end: [14.352, 4.896] }, { start: [16.06, 1.511], end: [16.062, 4.898] },
      ],
      height: 3.16,
      maxIntensity: 3.0,
      group: "living-track",
      sourceRef: SRC.generatedLights,
    }),
    fixtureGroup({ id: "light-dining-pendant", roomId: "kitchen-living", deviceId: "device-light-dining", kind: "pendant", points: [fixturePoint("decorative-01", 10.703, 2.003)], height: 2.28, maxIntensity: 2.0, group: "dining-decorative", sourceRef: SRC.generatedLights }),
  ],

  curtains: [
    { id: "curtain-visual-master", roomId: "master-bedroom", glazingId: "glazing-master-north", deviceId: "curtain-master", width: 2.765, height: 3.18, edgeClearance: 0.06, offsetFromGlass: 0.28, source: SRC.controls, confidence: "provisional" },
    { id: "curtain-visual-guest", roomId: "guest-bedroom", glazingId: "glazing-guest-west", deviceId: "curtain-guest", width: 1.76, height: 3.18, edgeClearance: 0.06, offsetFromGlass: 0.28, source: SRC.controls, confidence: "provisional" },
    { id: "curtain-visual-living-north", roomId: "kitchen-living", glazingId: "glazing-living-north-main", deviceId: "curtain-living-north", width: 5.458, height: 3.18, edgeClearance: 0.06, offsetFromGlass: 0.28, source: SRC.controls, confidence: "provisional" },
    { id: "curtain-visual-living-east", roomId: "kitchen-living", glazingId: "glazing-living-east", deviceId: "curtain-living-east", width: 6.855, height: 3.18, edgeClearance: 0.06, offsetFromGlass: 0.28, source: SRC.controls, confidence: "provisional" },
  ],

  devices: [
    ...[
      ["device-light-master", "master-bedroom", "Основной свет", 72],
      ["device-light-master-pendant", "master-bedroom", "Подвес над кроватью", 45],
      ["device-light-master-bath", "master-bath", "Свет ванной", 68],
      ["device-light-wardrobe", "wardrobe", "Свет гардеробной", 76],
      ["device-light-corridor", "corridor", "Свет коридора", 55],
      ["device-light-guest-wc", "guest-wc", "Линейный свет санузла", 64],
      ["device-light-guest", "guest-bedroom", "Основной свет", 70],
      ["device-light-guest-bath", "guest-bath", "Свет ванной", 62],
      ["device-light-hall", "hall", "Свет холла", 60],
      ["device-light-laundry", "laundry", "Свет постирочной", 70],
      ["device-light-living", "kitchen-living", "Линейная подсветка", 58],
      ["device-light-track", "kitchen-living", "Трековый свет", 64],
      ["device-light-dining", "kitchen-living", "Свет над столом", 48],
    ].map(([id, roomId, name, level]) => ({ id, roomId, name, kind: "light", visualId: LIGHT_VISUAL_BY_DEVICE[id], group: id, capabilities: ["on_off", "level"], on: true, level, state: "idle", binding: null, source: SRC.switches, confidence: "provisional", parameterConfidence: { grouping: "confirmed", initialLevel: "provisional" } })),
    ...[
      ["curtain-master", "master-bedroom", "Шторы мастер-спальни", 82],
      ["curtain-guest", "guest-bedroom", "Шторы гостевой", 74],
      ["curtain-living-north", "kitchen-living", "Шторы столовой", 100],
      ["curtain-living-east", "kitchen-living", "Шторы гостиной", 100],
    ].map(([id, roomId, name, level]) => ({ id, roomId, name, kind: "curtain", visualId: `curtain-visual-${id.replace("curtain-", "")}`, capabilities: ["open_close", "level", "stop"], on: true, level, state: "idle", binding: null, source: SRC.controls, confidence: "provisional", parameterConfidence: { controlPoint: "confirmed", initialLevel: "provisional" } })),
    ...[
      ["climate-master", "master-bedroom", "Климат мастер-спальни", 22],
      ["climate-guest", "guest-bedroom", "Климат гостевой", 22],
      ["climate-living", "kitchen-living", "Климат общей зоны", 22],
      ["climate-baths", "master-bath", "Тёплый пол ванных", 24],
    ].map(([id, roomId, name, level]) => ({ id, roomId, name, kind: "climate", visualId: null, capabilities: ["on_off", "setpoint"], on: true, level, state: "idle", binding: null, source: SRC.heating, confidence: "provisional" })),
  ],

  materials: [
    { id: "wall-warm-greige", kind: "wall", color: "#b7b0a5", roughness: 0.86, source: SRC.renders, confidence: "provisional" },
    { id: "ceiling-matte", kind: "ceiling", color: "#e5e2dc", roughness: 0.95, source: SRC.ceiling, confidence: "provisional" },
    { id: "oak-edinburgh", kind: "floor", color: "#3b3029", roughness: 0.72, source: SRC.floorPlan, sourceRefs: [SRC.floorPlan, SRC.finishSchedule], confidence: "provisional" },
    { id: "charcoal-entrance", kind: "floor", color: "#55534f", roughness: 0.7, source: SRC.floorPlan, sourceRefs: [SRC.floorPlan, SRC.finishSchedule], confidence: "provisional" },
    { id: "stone-statuario", kind: "stone", color: "#dad8d1", roughness: 0.32, source: SRC.finishes, sourceRefs: [SRC.finishes, SRC.finishSchedule], confidence: "provisional" },
    { id: "stone-calacatta", kind: "stone", color: "#d8d3c8", roughness: 0.36, source: SRC.finishes, sourceRefs: [SRC.finishes, SRC.finishSchedule], confidence: "provisional" },
    { id: "stone-calce", kind: "stone", color: "#c8c6bd", roughness: 0.48, source: SRC.finishes, sourceRefs: [SRC.finishes, SRC.finishSchedule], confidence: "provisional" },
    { id: "stone-cristallo", kind: "stone", color: "#d9d5cb", roughness: 0.3, source: SRC.finishes, sourceRefs: [SRC.finishes, SRC.finishSchedule], confidence: "provisional" },
    { id: "oak-dark", kind: "wood", color: "#2c2723", roughness: 0.58, source: SRC.renders, confidence: "provisional" },
    { id: "textile-warm", kind: "textile", color: "#c8c1b5", roughness: 0.94, source: SRC.renders, confidence: "provisional" },
    { id: "textile-olive", kind: "textile", color: "#777467", roughness: 0.96, source: SRC.renders, confidence: "provisional" },
    { id: "textile-ink", kind: "textile", color: "#273234", roughness: 0.95, source: SRC.renders, confidence: "provisional" },
    { id: "sanitary-white", kind: "ceramic", color: "#e9e8e3", roughness: 0.24, source: SRC.renders, confidence: "provisional" },
    { id: "glass-clear", kind: "glass", color: "#a8c6c4", roughness: 0.08, transmission: 0.96, opacity: 1, ior: 1.5, thickness: 0.012, source: SRC.survey, confidence: "provisional" },
    { id: "profile-black", kind: "metal", color: "#151918", roughness: 0.28, metalness: 0.68, source: SRC.elevations, confidence: "provisional" },
    { id: "bronze", kind: "metal", color: "#786b55", roughness: 0.34, metalness: 0.72, source: SRC.renders, confidence: "provisional" },
  ],

  scenarios: [
    { id: "day", name: "День", description: "Шторы открыты, рабочий свет приглушён", icon: "sun", lightLevel: 18, curtainLevel: 100, climate: 22 },
    { id: "evening", name: "Вечер", description: "Тёплый свет и приватность", icon: "moon", lightLevel: 62, curtainLevel: 24, climate: 23 },
    { id: "away", name: "Нет дома", description: "Свет выключен, климат экономичный", icon: "away", lightLevel: 0, curtainLevel: 0, climate: 18 },
  ],

  allowedContacts: [
    { id: "contact-floor-furniture", kinds: ["furniture", "floor"], reason: "Мебель опирается на чистый пол" },
    { id: "contact-wall-builtins", objectIds: ["wardrobe-system", "guest-cabinet", "laundry-cabinet", "kitchen-run", "hall-cabinet-main"], reason: "Встроенная мебель примыкает к указанной стене" },
    { id: "contact-ceiling-light", kinds: ["fixture", "ceiling"], reason: "Светильник закреплён на потолке" },
    { id: "contact-glazing-frame", kinds: ["glass", "frame"], reason: "Стеклопакет удерживается рамой внутри проёма" },
  ],

  qa: {
    planOverlay: "reference/final-plan-cropped-physical-24.png",
    lightOverlay: "reference/light-plan-cropped-physical-31.png",
    targetViewports: [[1440, 900], [1280, 720], [1024, 768], [390, 844]],
  },
};

export const PROJECT_SOURCES = SRC;
export const ROOM_BY_ID = new Map(projectManifest.rooms.map((item) => [item.id, item]));
export const MATERIAL_BY_ID = new Map(projectManifest.materials.map((item) => [item.id, item]));

export default projectManifest;
