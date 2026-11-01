// Author: CharlesQueen
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 CharlesQueen
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { ROOT } from "../core.mjs";

// Exercise actual isolated native windows and MCP reconnects.
// 使用隔离的真实原生窗口与 MCP 重连，验证用户的隐藏和退出选择。
const directory = path.join(ROOT, "qa/visibility-" + Date.now());
const profile = path.join(directory, "profile");
const env = {
  ...process.env,
  CODEX_PET_DESKTOP_AUTOSTART: "1",
  CODEX_PET_DATA_DIR: path.join(directory, "state"),
  CODEX_PET_DESKTOP_USER_DATA: profile,
};
delete env.ELECTRON_RUN_AS_NODE;
fs.mkdirSync(directory, { recursive: true });
const clients = [];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = () =>
  JSON.parse(fs.readFileSync(path.join(profile, "window-status.json"), "utf8"));
const mode = () =>
  JSON.parse(fs.readFileSync(path.join(profile, "visibility.json"), "utf8"))
    .mode;
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    if (e.code === "ESRCH") return false;
    throw e;
  }
};
async function until(check) {
  for (let i = 0; i < 150; i++) {
    try {
      const value = check();
      if (value) return value;
    } catch (e) {
      if (e.code !== "ENOENT" && !(e instanceof SyntaxError)) throw e;
    }
    await wait(100);
  }
  throw Error("Visibility check timed out");
}
async function connect() {
  const client = new Client({ name: "visibility-test", version: "1.0.0" });
  clients.push(client);
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [
        process.env.CODEX_PET_TEST_SERVER || path.join(ROOT, "server.mjs"),
      ],
      env,
      stderr: "pipe",
    }),
  );
  return client;
}
function command(flag) {
  const result = spawnSync(
    path.join(ROOT, "node_modules/electron/dist/electron.exe"),
    [path.join(ROOT, "desktop/main.mjs"), flag],
    { env, windowsHide: true, encoding: "utf8", timeout: 15000 },
  );
  assert.equal(result.status, 0, result.stderr || result.error?.message);
}
function launch() {
  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts/start-desktop.mjs")],
    { env, windowsHide: true, encoding: "utf8", timeout: 20000 },
  );
  assert.equal(result.status, 0, result.stderr || result.error?.message);
}
try {
  const first = await connect();
  const initial = await until(() => {
    const r = report();
    return r.visible && r.painted && !r.exiting && r;
  });
  command("--hide");
  await until(() => !report().visible && mode() === "hidden");
  const second = await connect();
  for (const state of ["running", "waiting", "review", "waving"]) {
    await second.callTool({
      name: "pet_set_state",
      arguments: {
        session_id: "visibility-check",
        state,
        mode: "hold",
        duration_ms: 10000,
      },
    });
    await wait(550);
    assert.equal(report().visible, false);
    assert.equal(
      report().exiting,
      undefined,
      "second-instance shutdown must not overwrite live report",
    );
    assert.equal(report().pid, initial.pid);
  }
  await first.close();
  await second.close();
  await until(() => !alive(initial.pid));
  assert.equal(mode(), "hidden");
  const third = await connect();
  const hiddenRestart = await until(() => {
    const r = report();
    return r.pid !== initial.pid && !r.exiting && r.painted && r;
  });
  assert.equal(
    hiddenRestart.visible,
    false,
    "hidden survives full host shutdown/restart",
  );
  assert.equal(mode(), "hidden");
  launch();
  assert.equal(report().visible, true);
  assert.equal(mode(), "shown");
  command("--exit");
  await until(() => !alive(hiddenRestart.pid));
  assert.equal(mode(), "exited");
  const stopped = report();
  assert.equal(stopped.exitReason, "user");
  const fourth = await connect();
  const fifth = await connect();
  await fourth.callTool({
    name: "pet_set_state",
    arguments: {
      session_id: "visibility-check",
      state: "running",
      mode: "hold",
    },
  });
  await wait(1500);
  assert.equal(
    report().startedAt,
    stopped.startedAt,
    "new hosts must not relaunch after exit",
  );
  assert.equal(alive(stopped.pid), false);
  command("--managed"); // Old host launch path must respect the same choice. / 旧连接直接启动也要遵守选择。
  assert.equal(report().startedAt, stopped.startedAt);
  assert.equal(alive(stopped.pid), false);
  await third.close();
  await fourth.close();
  await fifth.close();
  const sixth = await connect();
  await wait(800);
  assert.equal(
    alive(stopped.pid),
    false,
    "exit survives complete reconnection",
  );
  launch();
  const restored = report();
  assert.equal(restored.visible, true);
  assert.equal(mode(), "shown");
  assert.equal(
    restored.managed,
    true,
    "manual reopen rejoins existing work hosts",
  );
  const seventh = await connect();
  await wait(700);
  assert.equal(report().pid, restored.pid);
  assert.equal(report().exiting, undefined);
  await sixth.close();
  await seventh.close();
  await until(() => !alive(restored.pid));
  assert.equal(mode(), "shown", "host shutdown must not persist a user exit");
  console.log(
    JSON.stringify({
      ok: true,
      checks: [
        "hide persists through work states and new hosts",
        "hidden preference survives complete disconnect and reconnect",
        "manual show restores hidden window",
        "user exit blocks new hosts and legacy managed launches",
        "exit persists through complete reconnect",
        "manual reopen restores automatic lifecycle",
        "secondary instances do not corrupt window reports",
      ],
    }),
  );
} finally {
  await Promise.allSettled(clients.map((c) => c.close()));
  if (
    fs.existsSync(path.join(profile, "window-status.json")) &&
    alive(report().pid)
  )
    command("--quit");
}
