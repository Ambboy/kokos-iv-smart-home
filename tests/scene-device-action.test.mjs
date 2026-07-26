import assert from "node:assert/strict";
import test from "node:test";
import { activationCommandForDevice } from "../src/scene/sceneDeviceAction.js";

test("tapping an enabled light turns its source off", () => {
  assert.deepEqual(
    activationCommandForDevice({ id: "light-1", kind: "light", on: true, level: 62 }),
    { deviceId: "light-1", action: "toggle", value: false },
  );
});

test("tapping a disabled light turns its source on", () => {
  assert.deepEqual(
    activationCommandForDevice({ id: "light-1", kind: "light", on: false, level: 62 }),
    { deviceId: "light-1", action: "toggle", value: true },
  );
});

test("tapping a mostly closed curtain opens it", () => {
  assert.deepEqual(
    activationCommandForDevice({ id: "curtain-1", kind: "curtain", level: 24 }),
    { deviceId: "curtain-1", action: "setLevel", value: 100 },
  );
});

test("tapping a mostly open curtain closes it", () => {
  assert.deepEqual(
    activationCommandForDevice({ id: "curtain-1", kind: "curtain", level: 75 }),
    { deviceId: "curtain-1", action: "setLevel", value: 0 },
  );
});

test("non-interactive devices do not receive a scene command", () => {
  assert.equal(activationCommandForDevice({ id: "climate-1", kind: "climate", level: 23 }), null);
  assert.equal(activationCommandForDevice(null), null);
});
