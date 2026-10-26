// Author: CharlesQueen
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 CharlesQueen
// 本项目仅供非商业学习、交流与分享。对于他人违反许可证或侵犯第三方权利的使用行为及其后果，作者概不承担任何责任。
// This project is provided solely for noncommercial learning, discussion, and sharing. The author assumes no liability whatsoever for others’ use in violation of the license or third-party rights, or for any resulting consequences.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, manifest } from "../core.mjs";
import { sizeForHeight, clampBounds } from "../desktop/window-model.mjs";

export async function runNativeWindowTest(context) {
  const {
    current,
    win,
    settings,
    resizeHeight,
    broadcast,
    setPin,
    perform,
    automatic,
    reveal,
    userData,
  } = context;
  const ratio = manifest().canvas[0] / manifest().canvas[1];
  const screen = context.screen;
  async function waitForPaint(expected) {
    for (let i = 0; i < 200; i++) {
      if (
        context.getPainted() &&
        (!expected || context.getPainted().state === expected)
      )
        return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("Sprite did not paint: " + expected);
  }

  await waitForPaint("idle");
  settings.locale = "en";
  broadcast();
  await new Promise((r) => setTimeout(r, 120));
  if (
    (await win.webContents.executeJavaScript(
      "document.getElementById('caption').textContent",
    )) !== "Quiet company"
  )
    throw new Error("English caption failed");
  settings.locale = "zh";
  broadcast();
  await new Promise((r) => setTimeout(r, 120));
  if (
    (await win.webContents.executeJavaScript(
      "document.getElementById('caption').textContent",
    )) !== "安静陪伴"
  )
    throw new Error("Chinese caption failed");
  const before = win.getBounds();
  resizeHeight(510);
  await new Promise((r) => setTimeout(r, 150));
  const resized = win.getBounds(),
    wanted = sizeForHeight(
      510,
      ratio,
      screen.getDisplayMatching(resized).workArea,
    );
  if (Math.abs(resized.height - wanted.height) > 2)
    throw new Error(
      "Resize failed " +
        JSON.stringify({
          resized,
          wanted,
          area: screen.getDisplayMatching(resized).workArea,
        }),
    );
  const area = screen.getDisplayMatching(win.getBounds()).workArea;
  win.setBounds(
    clampBounds({ ...win.getBounds(), x: area.x + 50, y: area.y + 40 }, area),
  );
  if (win.getBounds().x !== area.x + 50) throw new Error("Move failed");
  win.showInactive();
  await new Promise((r) => setTimeout(r, 150));
  setPin(false);
  await new Promise((r) => setTimeout(r, 100));
  if (win.isAlwaysOnTop()) throw new Error("Unpin failed");
  setPin(true);
  for (let n = 0; n < 10 && !win.isAlwaysOnTop(); n++) {
    await new Promise((r) => setTimeout(r, 150));
  }
  if (!win.isAlwaysOnTop()) throw new Error("Pin failed");
  await win.webContents.executeJavaScript(
    "document.dispatchEvent(new PointerEvent('pointermove',{clientX:1,clientY:1}))",
  );
  await new Promise((r) => setTimeout(r, 60));
  if (!context.isIgnoringMouse())
    throw new Error("Transparent area did not enable click-through");
  await win.webContents.executeJavaScript(
    "document.dispatchEvent(new PointerEvent('pointermove',{clientX:innerWidth*.52,clientY:innerHeight*.55}));document.dispatchEvent(new PointerEvent('pointerleave'))",
  );
  await new Promise((r) => setTimeout(r, 60));
  if (context.isIgnoringMouse())
    throw new Error("Pet area did not restore mouse interaction");
  await win.webContents.executeJavaScript(
    "document.body.classList.add('show-controls');document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))",
  );
  if (
    await win.webContents.executeJavaScript(
      "document.body.classList.contains('show-controls')",
    )
  )
    throw new Error("Escape did not collapse controls");
  if (win.isDestroyed()) throw new Error("Escape destroyed window");
  perform("jumping");
  await waitForPaint("jumping");
  automatic();
  await waitForPaint("idle");
  const movedBefore = win.getBounds();
  const start = { x: movedBefore.x + 200, y: movedBefore.y + 180 },
    end = { x: start.x + 60, y: start.y + 30 };
  await win.webContents.executeJavaScript(
    "window.codexPetDesktop.dragStart(" +
      JSON.stringify(start) +
      ");window.codexPetDesktop.dragMove(" +
      JSON.stringify(end) +
      ");window.codexPetDesktop.dragEnd()",
  );
  await new Promise((r) => setTimeout(r, 130));
  if (Math.abs(win.getBounds().x - (movedBefore.x + 60)) > 2)
    throw new Error("Drag IPC failed");
  const callback = path.join(
    ROOT,
    "release/codex-desktop-pet/hooks/bridge.mjs",
  );
  for (const [event, state] of [
    ["SessionStart", "idle"],
    ["UserPromptSubmit", "running"],
    ["PermissionRequest", "waiting"],
    ["PostToolUse", "running"],
    ["Stop", "idle"],
  ]) {
    const response = spawnSync("node", [callback], {
      env: process.env,
      input: JSON.stringify({
        session_id: "native-self-test",
        hook_event_name: event,
        tool_response: { exit_code: 0 },
      }),
      encoding: "utf8",
      windowsHide: true,
    });
    if (response.status !== 0) throw new Error("Hook subprocess failed");
    settings.session_id = "native-self-test";
    broadcast();
    await waitForPaint(state);
    if (!current().hook_seen || current().source !== "hook")
      throw new Error("Native window did not read hook state");
  }
  const capture = await win.webContents.capturePage();
  const out = path.join(userData, "self-test-capture.png");
  fs.writeFileSync(out, capture.toPNG());
  const bitmap = capture.toBitmap();
  let transparent = 0,
    opaque = 0;
  for (let i = 3; i < bitmap.length; i += 4) {
    if (bitmap[i] === 0) transparent++;
    if (bitmap[i] > 200) opaque++;
  }
  if (!transparent || !opaque)
    throw new Error("Transparent sprite capture invalid");
  win.showInactive();
  await new Promise((r) => setTimeout(r, 150));
  if (!win.isVisible()) throw new Error("Window show failed");
  win.close();
  if (win.isDestroyed() || win.isVisible())
    throw new Error("Close should hide without destroying");
  reveal();
  if (!win.isVisible()) throw new Error("Restore failed");
  const result = {
    ok: true,
    nativeWindow: true,
    transparentPixels: transparent,
    opaquePixels: opaque,
    nativeAssetSize: manifest().canvas,
    capturePath: out,
    checks: [
      "lossless asset painted",
      "programmatic resize",
      "window move",
      "pin/unpin",
      "Escape keeps window alive",
      "action change",
      "auto restore",
      "transparent capture",
      "show/hide/restore",
      "drag IPC",
      "installed hook-to-window transitions",
      "transparent-area mouse passthrough",
    ],
    bounds: win.getBounds(),
  };
  fs.writeFileSync(
    path.join(userData, "self-test.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
  context.quit("self-test-complete");
}
