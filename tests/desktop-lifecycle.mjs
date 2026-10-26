// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 CharlesQueen
// 本项目仅供非商业学习、交流与分享。对于他人违反许可证或侵犯第三方权利的使用行为及其后果，作者概不承担任何责任。
// This project is provided solely for noncommercial learning, discussion, and sharing. The author assumes no liability whatsoever for others’ use in violation of the license or third-party rights, or for any resulting consequences.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { ROOT } from "../core.mjs";
const directory = path.join(ROOT, "qa/lifecycle-" + Date.now()),
  profile = path.join(directory, "profile");
fs.mkdirSync(directory, { recursive: true });
const env = {
  ...process.env,
  CODEX_PET_DESKTOP_AUTOSTART: "1",
  CODEX_PET_DATA_DIR: path.join(directory, "state"),
  CODEX_PET_DESKTOP_USER_DATA: profile,
};
const clients = [],
  transports = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check) {
  for (let n = 0; n < 200; n++) {
    try {
      const x = check();
      if (x) return x;
    } catch {}
    await wait(100);
  }
  throw new Error("Lifecycle check timed out");
}
function report() {
  return JSON.parse(
    fs.readFileSync(path.join(profile, "window-status.json"), "utf8"),
  );
}
function hostCount() {
  const dir = path.join(directory, "state/desktop-hosts");
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .map((n) => JSON.parse(fs.readFileSync(path.join(dir, n), "utf8")))
    .filter((v) => Date.now() - v.heartbeat < 8000).length;
}
async function connect() {
  const client = new Client({ name: "pet-lifecycle-test", version: "1.0.0" });
  clients.push(client);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [process.env.CODEX_PET_TEST_SERVER || path.join(ROOT, "server.mjs")],
    env,
    stderr: "pipe",
  });
  transports.push(transport);
  await client.connect(transport);
  return client;
}
try {
  const launch = () => {
    const result = spawnSync(
      process.execPath,
      [path.join(ROOT, "scripts/start-desktop.mjs")],
      {
        env,
        encoding: "utf8",
        timeout: 20000,
        windowsHide: true,
      },
    );
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert.match(result.stdout, /Pet is visible/);
    return report();
  };
  const standalone = launch();
  assert.equal(standalone.managed, false);
  assert.equal(standalone.hostCount, 0);
  await wait(4500);
  process.kill(standalone.pid, 0);
  assert.equal(launch().pid, standalone.pid);
  const first = await connect();
  const initial = await until(() => {
    const s = report();
    return s.visible && s.painted && s.managed && !s.exiting ? s : null;
  });
  assert.equal(initial.hostCount, 1);
  assert.equal(initial.pid, standalone.pid);
  const pid = initial.pid;
  const second = await connect();
  await until(() => hostCount() === 2);
  await wait(700);
  assert.equal(report().pid, pid);
  await first.close();
  await until(() => hostCount() === 1);
  await wait(4500);
  assert.equal(report().exiting, undefined);
  process.kill(pid, 0);
  await second.close();
  await until(() => report().exiting);
  assert.equal(report().exitReason, "all-plugin-hosts-disconnected");
  await until(() => {
    try {
      process.kill(pid, 0);
      return false;
    } catch {
      return true;
    }
  });
  const third = await connect();
  const restarted = await until(() => {
    const s = report();
    return !s.exiting && s.visible && s.startedAt > initial.startedAt
      ? s
      : null;
  });
  assert.notEqual(restarted.pid, pid);
  process.kill(transports.at(-1).pid, "SIGKILL");
  await until(() => report().exiting);
  await until(() => {
    try {
      process.kill(restarted.pid, 0);
      return false;
    } catch {
      return true;
    }
  });
  const result = {
    ok: true,
    checkedAt: Date.now(),
    checks: [
      "installer launcher shows painted window without MCP",
      "standalone survives without hosts and repeated launch reuses window",
      "MCP takes over existing standalone window",
      "MCP initialize opens visible native window",
      "two hosts share one window",
      "closing one host preserves window",
      "last host disconnect closes native process",
      "new host reconnect starts visible window",
      "unexpected host termination closes native process",
    ],
    initial,
    restarted,
  };
  fs.writeFileSync(
    path.join(ROOT, "qa/desktop-lifecycle-verification.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify({ ok: true, checks: result.checks }));
} finally {
  await Promise.allSettled(clients.map((c) => c.close()));
}
