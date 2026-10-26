// Author: CharlesQueen
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { ROOT } from "../core.mjs";

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 458, height: 360 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("http://pet.test/**", async (route) => {
    const name = new URL(route.request().url()).pathname.slice(1);
    const file = path.resolve(ROOT, name);
    assert.ok(file.startsWith(ROOT + path.sep));
    await route.fulfill({
      body: await fs.readFile(file),
      contentType: name.endsWith(".mjs")
        ? "text/javascript"
        : name.endsWith(".css")
          ? "text/css"
          : name.endsWith(".png")
            ? "image/png"
            : "text/html",
    });
  });
  await page.addInitScript(() => {
    window.testStatus = {
      state: "idle",
      mode: "auto",
      outfit: "white",
      locale: "en",
    };
    window.codexPetDesktop = {
      snapshot: async () => window.testStatus,
      asset: async () => "/assets/white/idle-still.png",
      onPointer: (cb) => (window.emitPointer = cb),
      onStatus: (cb) => (window.emitStatus = cb),
      onCollapse: () => {},
      painted: (p) => (window.lastPaint = p),
      mouseIgnore: () => {},
      dragStart: () => {},
      dragMove: () => {},
      dragEnd: () => {},
    };
  });
  await page.goto("http://pet.test/desktop/index.html");
  await page.waitForFunction(() => window.lastPaint?.state === "idle");
  await page.evaluate(() => window.emitPointer({ x: 478, y: 126 }));
  await page.waitForFunction(
    () => window.lastPaint?.state === "looking" && window.lastPaint.index === 4,
  );
  await page.evaluate(() => window.emitPointer(null));
  await page.waitForFunction(() => window.lastPaint?.state === "idle");
  await page.evaluate(() => {
    window.emitStatus({ ...window.testStatus, state: "running" });
    window.emitPointer({ x: -20, y: 126 });
  });
  await page.waitForFunction(() => window.lastPaint?.state === "running");
  await page.evaluate(() => {
    window.emitStatus(window.testStatus);
    document.body.setPointerCapture = () => {};
    document.dispatchEvent(
      new PointerEvent("pointerdown", {
        button: 0,
        clientX: 229,
        clientY: 200,
        screenX: 100,
        pointerId: 1,
      }),
    );
  });
  for (const [x, state] of [
    [200, "running-right"],
    [190, "running-left"],
    [198, "running-right"],
  ]) {
    await page.evaluate(
      (x) =>
        document.dispatchEvent(
          new PointerEvent("pointermove", { screenX: x, screenY: 200 }),
        ),
      x,
    );
    await page.waitForFunction(
      (state) => window.lastPaint?.state === state,
      state,
    );
  }
  await page.evaluate(() =>
    document.dispatchEvent(new PointerEvent("pointerup")),
  );
  await page.waitForFunction(() => window.lastPaint?.state === "idle");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: near-window gaze, exit reset, working-state priority, continuous drag reversal, release reset",
  );
} finally {
  await browser.close();
}
