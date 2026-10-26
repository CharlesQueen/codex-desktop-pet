// Author: CharlesQueen
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 CharlesQueen
// 本项目仅供非商业学习、交流与分享。对于他人违反许可证或侵犯第三方权利的使用行为及其后果，作者概不承担任何责任。
// This project is provided solely for noncommercial learning, discussion, and sharing. The author assumes no liability whatsoever for others’ use in violation of the license or third-party rights, or for any resulting consequences.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { build } from "esbuild";
process.env.CODEX_PET_DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "pet-ui-"),
);
const { html, invoke, startPreview } = await import("../server.mjs");
const { ROOT, applyHook, manifest } = await import("../core.mjs");
const { chromium } = await import("playwright");
const qa = path.join(ROOT, "qa");
fs.mkdirSync(qa, { recursive: true });
const bundle = await build({
  stdin: {
    contents: `import {AppBridge,PostMessageTransport} from '@modelcontextprotocol/ext-apps/app-bridge';const f=document.getElementById('app');const bridge=new AppBridge(null,{name:'Codex Pet Test Host',version:'1.0.0'},{serverTools:{},logging:{}},{hostContext:{theme:'light',locale:'zh-CN',displayMode:'inline',availableDisplayModes:['inline']}});bridge.oncalltool=p=>window.petHostTool(p.name,p.arguments);bridge.oninitialized=()=>window.petInitialized=true;await bridge.connect(new PostMessageTransport(f.contentWindow,f.contentWindow));window.petHostReady=true;`,
    resolveDir: ROOT,
    sourcefile: "host-test.mjs",
  },
  bundle: true,
  write: false,
  format: "esm",
  target: "es2022",
});
const host = http.createServer((req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end(
    '<!doctype html><html><body style="margin:0"><iframe id="app" title="companion" style="width:100%;height:950px;border:0"></iframe></body></html>',
  );
});
await new Promise((resolve) => host.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  const page = await browser.newPage({
    viewport: { width: 720, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.exposeFunction("petHostTool", (name, args) => invoke(name, args));
  applyHook({ session_id: "ui-chat", hook_event_name: "SessionStart" });
  await page.goto("http://127.0.0.1:" + host.address().port);
  await page.addScriptTag({
    type: "module",
    content: bundle.outputFiles[0].text,
  });
  await page.waitForFunction(() => window.petHostReady);
  await page.evaluate(
    (content) => (document.getElementById("app").srcdoc = content),
    html(),
  );
  await page.waitForFunction(() => window.petInitialized);
  const frame = page.frameLocator("#app");
  await frame.locator("#language").selectOption("en");
  await frame
    .getByRole("button", { name: "Follow work state", exact: true })
    .waitFor();
  assert.equal(
    await frame.locator("#outfit").innerText(),
    "White Lolita dress",
  );
  await frame.locator("#language").selectOption("zh");
  await frame
    .getByRole("button", { name: "跟随工作状态", exact: true })
    .waitFor();
  await frame.locator("#language").selectOption("zh");
  await frame.locator("#pet").evaluate(
    (im) =>
      new Promise((resolve, reject) => {
        const t = setInterval(() => {
          if (im.naturalWidth > 1000) {
            clearInterval(t);
            resolve();
          }
        }, 50);
        setTimeout(() => {
          clearInterval(t);
          reject(new Error("HD image did not load"));
        }, 30000);
      }),
  );
  assert.deepEqual(
    await frame
      .locator("#pet")
      .evaluate((im) => [im.naturalWidth, im.naturalHeight]),
    manifest().canvas,
  );
  await page.screenshot({
    path: path.join(qa, "companion-idle.png"),
    fullPage: true,
  });
  await frame.locator("summary").click();
  await frame.getByRole("button", { name: "开心跳跃", exact: true }).click();
  await frame.locator("#caption").filter({ hasText: "开心跳跃" }).waitFor();
  const wanted = manifest().animations.jumping.sha256;
  await frame.locator("#pet").evaluate(async (im, wanted) => {
    for (let i = 0; i < 80; i++) {
      const bytes = await fetch(im.src).then((r) => r.arrayBuffer());
      const h = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (x) => x.toString(16).padStart(2, "0"),
      ).join("");
      if (h === wanted) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Displayed image was not the complete jumping asset");
  }, wanted);
  await page.screenshot({
    path: path.join(qa, "companion-jumping.png"),
    fullPage: true,
  });
  applyHook({ session_id: "ui-chat", hook_event_name: "UserPromptSubmit" });
  await frame
    .locator("#caption")
    .filter({ hasText: "专注工作" })
    .waitFor({ timeout: 10000 });
  applyHook({ session_id: "other-chat", hook_event_name: "PermissionRequest" });
  await new Promise((r) => setTimeout(r, 1700));
  assert.equal(await frame.locator("#caption").innerText(), "专注工作");
  applyHook({ session_id: "ui-chat", hook_event_name: "PermissionRequest" });
  await frame
    .locator("#caption")
    .filter({ hasText: "等你回应" })
    .waitFor({ timeout: 10000 });
  applyHook({ session_id: "ui-chat", hook_event_name: "Stop" });
  await frame
    .locator("#caption")
    .filter({ hasText: "安静陪伴" })
    .waitFor({ timeout: 10000 });
  assert.deepEqual(errors, []);
  const preview = await startPreview();
  try {
    const denied = await fetch(preview.url + "/api/tool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "pet_preview", args: { state: "jumping" } }),
    });
    assert.equal(denied.status, 403);
  } finally {
    await new Promise((r) => preview.server.close(r));
  }
  fs.writeFileSync(
    path.join(qa, "browser-verification.json"),
    JSON.stringify(
      {
        ok: true,
        standardMcpAppBridge: true,
        actualWorkHostVerified: false,
        nativePixels: manifest().canvas,
        fullAssetHashMatched: true,
        hookTransitions: ["idle", "running", "waiting", "idle"],
        otherSessionIsolated: true,
        unauthorizedPreviewMutationRejected: true,
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: official AppBridge iframe, native HD pixels, complete file hash, working-state transitions, chat isolation and preview request guard.",
  );
} finally {
  await browser?.close();
  await new Promise((r) => host.close(r));
}
