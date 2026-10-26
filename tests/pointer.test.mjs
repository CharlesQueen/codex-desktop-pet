// Author: CharlesQueen
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import test from "node:test";
import assert from "node:assert/strict";
import {
  nearbyPointer,
  dragDirection,
  lookDirection,
} from "../desktop/pointer-model.mjs";

test("gaze includes the window perimeter but stops beyond its modest margin", () => {
  const b = { x: -500, y: 100, width: 458, height: 360 };
  assert.deepEqual(nearbyPointer({ x: -530, y: 200 }, b), { x: -30, y: 100 });
  assert.deepEqual(nearbyPointer({ x: -12, y: 200 }, b), { x: 488, y: 100 });
  assert.equal(nearbyPointer({ x: 10, y: 200 }, b), null);
  assert.equal(nearbyPointer({ x: -300, y: 510 }, b), null);
  const box = { left: 0, top: 0, width: 458, height: 360 };
  assert.equal(lookDirection({ x: 488, y: 126 }, box), 4);
  assert.equal(lookDirection({ x: -30, y: 126 }, box), 12);
  assert.equal(lookDirection({ x: 229, y: 126 }, box), undefined);
  assert.equal(lookDirection(null, box), undefined);
});

test("continuous drag reverses before crossing the original pointer-down point", () => {
  let p = dragDirection(100, 200);
  assert.equal(p.state, "running-right");
  p = dragDirection(p.anchor, 190, p.state);
  assert.equal(p.state, "running-left");
  p = dragDirection(p.anchor, 198, p.state);
  assert.equal(p.state, "running-right");
});

test("slow drag accumulates movement while tiny jitter does not flip direction", () => {
  let p = { anchor: 100, state: "running-right" };
  for (const x of [99, 98, 99, 97]) p = dragDirection(p.anchor, x, p.state);
  assert.equal(p.state, "running-right");
  p = dragDirection(p.anchor, 96, p.state);
  assert.equal(p.state, "running-left");
});
