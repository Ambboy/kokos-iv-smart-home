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
