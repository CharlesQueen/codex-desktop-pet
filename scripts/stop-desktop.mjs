// Author: CharlesQueen
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 CharlesQueen
// 本项目仅供非商业学习、交流与分享。对于他人违反许可证或侵犯第三方权利的使用行为及其后果，作者概不承担任何责任。
// This project is provided solely for noncommercial learning, discussion, and sharing. The author assumes no liability whatsoever for others’ use in violation of the license or third-party rights, or for any resulting consequences.
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { ROOT } from "../core.mjs";
const profile =
    process.env.CODEX_PET_DESKTOP_USER_DATA ||
    path.join(ROOT, ".local/desktop"),
  report = path.join(profile, "window-status.json");
if (fs.existsSync(report)) {
  const previous = JSON.parse(fs.readFileSync(report, "utf8")),
    exe = path.join(ROOT, "node_modules/electron/dist/electron.exe");
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(exe, [path.join(ROOT, "desktop/main.mjs"), "--quit"], {
    env,
    windowsHide: true,
    stdio: "ignore",
  });
  await new Promise((resolve, reject) => {
    child.on("exit", resolve);
    child.on("error", reject);
  });
  for (let i = 0; i < 20; i++) {
    const latest = JSON.parse(fs.readFileSync(report, "utf8"));
    if (latest.exiting) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  // Older releases lack --quit; match the recorded PID and exact executable. / 旧版退出前校验记录中的进程及程序路径。
  const script =
    "$p=Get-Process -Id " +
    Number(previous.pid) +
    " -ErrorAction SilentlyContinue; if ($p -and $p.Path -eq $env:CODEX_PET_STOP_EXE) { Stop-Process -Id $p.Id -ErrorAction Stop }; exit 0";
  execFileSync("powershell", ["-NoProfile", "-Command", script], {
    env: { ...process.env, CODEX_PET_STOP_EXE: exe },
    windowsHide: true,
    stdio: "pipe",
  });
}
console.log("Pet stopped / 桌宠已退出");
