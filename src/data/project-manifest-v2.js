import legacyManifest from "./project-manifest.js";

const manifest = structuredClone(legacyManifest);

const topologySource = manifest.sources.find((source) => source.pdfPage === 24);
const surveySource = manifest.sources.find((source) => source.pdfPage === 22);
const doorSource = manifest.sources.find((source) => source.pdfPage === 25);

manifest.meta = {
  ...manifest.meta,
  version: "0.2.0-rebuild",
  geometryRevision: "pdf-architecture-dwg-bindings-v1",
  generatedAt: "2026-07-26",
};

manifest.coordinateSystem = {
  ...manifest.coordinateSystem,
  origin: "Северо-западный внутренний угол мастер-спальни на листе 4",
  source: topologySource,
  confidence: "provisional",
  note: "Архитектура регистрируется по PDF: физические страницы 22, 24 и 25. Доступные DWG-листы 6, 12, 13 и 14 используются для мебели и привязок устройств; архитектурных DWG-листов 2/4/5 в комплекте нет.",
};

manifest.shell = {
  ...manifest.shell,
  source: surveySource,
  confidence: "provisional",
  note: "Контур повторно выделен по обмерному листу PDF 22 и сверяется с перепланировкой PDF 24; архитектурные DWG-листы 2, 4 и 5 отсутствуют.",
};

manifest.rooms = manifest.rooms.map((room) => ({
  ...room,
  source: topologySource,
  confidence: "provisional",
  parameterConfidence: {
    ...room.parameterConfidence,
    reportedArea: "confirmed",
    polygon: "provisional",
  },
}));

manifest.walls = manifest.walls.map((wall) => ({
  ...wall,
  source: topologySource,
  confidence: "provisional",
  parameterConfidence: {
    ...wall.parameterConfidence,
    centerlineXZ: "provisional",
  },
}));

manifest.doors = manifest.doors.map((door) => ({
  ...door,
  source: doorSource,
  confidence: "provisional",
}));

manifest.glazing = manifest.glazing.map((glazing) => ({
  ...glazing,
  source: surveySource,
  confidence: "provisional",
}));

manifest.openPassages = manifest.openPassages.map((passage) => ({
  ...passage,
  source: topologySource,
  confidence: "provisional",
}));

export const projectManifestV2 = manifest;
export default projectManifestV2;
