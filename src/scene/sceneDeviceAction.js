export function activationCommandForDevice(device) {
  if (!device || !device.id) return null;
  if (device.kind === "light") {
    return { deviceId: device.id, action: "toggle", value: !device.on };
  }
  if (device.kind === "curtain") {
    return {
      deviceId: device.id,
      action: "setLevel",
      value: Number(device.level) >= 50 ? 0 : 100,
    };
  }
  return null;
}
