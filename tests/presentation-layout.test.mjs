import assert from "node:assert/strict";
import test from "node:test";

import { computePresentationZoom } from "../src/scene/presentationLayout.js";

test("desktop framing keeps the dollhouse legible between two inspector rails", () => {
  const zoom = computePresentationZoom({ width: 1440, height: 900, safeWidth: 612, safeHeight: 760 });
  assert.equal(zoom, 0.62);
});

test("presentation zoom scales up a spacious safe frame without exceeding the visual ceiling", () => {
  const zoom = computePresentationZoom({ width: 1200, height: 800, safeWidth: 1050, safeHeight: 720 });
  assert.equal(zoom, 1.14);
});

test("mobile framing prioritizes a complete plan over desktop-scale detail", () => {
  const zoom = computePresentationZoom({ width: 390, height: 844, safeWidth: 366, safeHeight: 500 });
  assert.ok(Math.abs(zoom - 0.5332) < 0.0001);
});

test("presentation zoom rejects invalid dimensions", () => {
  assert.equal(computePresentationZoom({ width: 0, height: 800, safeWidth: 500, safeHeight: 500 }), 1);
});
