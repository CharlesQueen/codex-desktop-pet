// Author: CharlesQueen
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 CharlesQueen
// 本项目仅供非商业学习、交流与分享。对于他人违反许可证或侵犯第三方权利的使用行为及其后果，作者概不承担任何责任。
// This project is provided solely for noncommercial learning, discussion, and sharing. The author assumes no liability whatsoever for others’ use in violation of the license or third-party rights, or for any resulting consequences.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { DATA, ROOT } from "./core.mjs";
const leases = path.join(DATA, "desktop-hosts");
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
};
export function activeDesktopHosts() {
  if (!fs.existsSync(leases)) return [];
  return fs
    .readdirSync(leases)
    .filter((n) => /^[a-f0-9-]+\.json$/.test(n))
    .map((n) => JSON.parse(fs.readFileSync(path.join(leases, n), "utf8")))
    .filter(
      (v) =>
        Date.now() - v.heartbeat < 8000 && alive(v.pid) && alive(v.parentPid),
    );
}
export function attachDesktopHost() {
  if (process.env.CODEX_PET_DESKTOP_AUTOSTART !== "1") return () => {};
  const config = JSON.parse(
    fs.readFileSync(path.join(ROOT, "runtime.json"), "utf8"),
  );
  const directory = config.desktop_directory;
  const executable = path.join(
      directory,
      "node_modules/electron/dist/electron.exe",
    ),
    main = path.join(directory, "desktop/main.mjs");

  fs.mkdirSync(leases, { recursive: true });
  const token = crypto.randomUUID(),
    file = path.join(leases, token + ".json"),
    parentPid = process.ppid;
  let released = false;
  const write = () => {
    if (released) return;
    if (!alive(parentPid)) {
      release();
      return;
    }
    const temporary = file + ".tmp";
    fs.writeFileSync(
      temporary,
      JSON.stringify({
        pid: process.pid,
        parentPid,
        token,
        heartbeat: Date.now(),
      }),
    );
    fs.renameSync(temporary, file);
  };
  const timer = setInterval(write, 2000);
  timer.unref();
  function release() {
    if (released) return;
    released = true;
    clearInterval(timer);
    const temporary = file + ".tmp";
    fs.writeFileSync(
      temporary,
      JSON.stringify({ pid: process.pid, parentPid, token, heartbeat: 0 }),
    );
    fs.renameSync(temporary, file);
  }
  write();
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, [main, "--managed"], {
    env,
    detached: true,
    windowsHide: true,
    stdio: "ignore",
  });
  child.on("error", (error) => {
    release();
    throw error;
  });
  child.unref();
  process.once("exit", release);
  return release;
}
