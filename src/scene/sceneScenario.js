const LIGHT_PALETTES = {
  day: {
    background: "#30343a",
    ground: "#24272c",
    environmentIntensity: 0.62,
    hemisphereColor: "#e7efff",
    hemisphereGroundColor: "#5a4638",
    hemisphereIntensity: 0.9,
    sunColor: "#fff1d6",
    sunIntensity: 1.5,
    exposure: 0.94,
    sceneLightFactor: 0.38,
    fixtureColor: "#fff1d6",
  },
  evening: {
    background: "#1c0d08",
    ground: "#140906",
    environmentIntensity: 0.18,
    hemisphereColor: "#ffb06b",
    hemisphereGroundColor: "#2f1208",
    hemisphereIntensity: 0.32,
    sunColor: "#ff8b4d",
    sunIntensity: 0.1,
    exposure: 1.08,
    sceneLightFactor: 1.35,
    fixtureColor: "#ff8a3d",
  },
  away: {
    background: "#0b0a09",
    ground: "#090807",
    environmentIntensity: 0.08,
    hemisphereColor: "#aeb5b2",
    hemisphereGroundColor: "#151310",
    hemisphereIntensity: 0.22,
    sunColor: "#ffe4bd",
    sunIntensity: 0.08,
    exposure: 0.66,
    sceneLightFactor: 0.72,
    fixtureColor: "#d7c6ae",
  },
};

export function scenarioLightPalette(scenarioId) {
  return LIGHT_PALETTES[scenarioId] ?? LIGHT_PALETTES.day;
}

export function devicesForScenario(manifest, scenarioId) {
  const scenario = manifest.scenarios.find((item) => item.id === scenarioId) ?? manifest.scenarios[0];
  return manifest.devices.map((item) => {
    if (item.kind === "light") {
      const level = scenario.lightLevels?.[item.id] ?? scenario.lightLevel;
      return { ...item, on: level > 0, level, state: "idle" };
    }
    if (item.kind === "curtain") {
      return { ...item, on: true, level: scenario.curtainLevel, state: "idle" };
    }
    if (item.kind === "climate") {
      return { ...item, on: true, level: scenario.climate, state: "idle" };
    }
    return { ...item };
  });
}
