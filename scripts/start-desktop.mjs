// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 CharlesQueen
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { ROOT } from "../core.mjs";

const profile =
  process.env.CODEX_PET_DESKTOP_USER_DATA ||
  path.join(ROOT, ".local", "desktop");
const executable = path.join(ROOT, "node_modules/electron/dist/electron.exe");
if (!fs.existsSync(executable))
  throw new Error(
    "Electron runtime missing. Run pnpm run setup to install dependencies and the desktop runtime.",
  );
fs.mkdirSync(profile, { recursive: true });
const logPath = path.join(profile, "startup.log");
const log = fs.openSync(logPath, "a");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const requestedAt = Date.now();
let launchError;
const child = spawn(executable, [path.join(ROOT, "desktop/main.mjs")], {
  cwd: ROOT,
  env,
  detached: true,
  windowsHide: true,
  stdio: ["ignore", log, log],
});
fs.closeSync(log);
child.on("error", (error) => {
  launchError = error;
});
child.unref();
// A fresh renderer acknowledgement is required, including for an existing instance.
// 包括已有实例在内，必须收到本次启动后的窗口绘制确认。
let ready = false;
for (let i = 0; i < 150; i++) {
  if (launchError) throw launchError;
  try {
    const report = JSON.parse(
      fs.readFileSync(path.join(profile, "window-status.json"), "utf8"),
    );
    if (
      report.updatedAt >= requestedAt &&
      report.visible &&
      report.painted &&
      report.visibleArea > 0 &&
      !report.exiting
    ) {
      process.kill(report.pid, 0);
      ready = true;
      console.log("Pet is visible / 桌宠已显示");
      break;
    }
  } catch (error) {
    if (
      !["ENOENT", "ESRCH"].includes(error.code) &&
      !(error instanceof SyntaxError)
    )
      throw error;
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
}
if (!ready)
  throw new Error(
    `Pet did not become visible within 15 seconds. See ${logPath}`,
  );
