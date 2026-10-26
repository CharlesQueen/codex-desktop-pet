// Author: CharlesQueen
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 CharlesQueen
// 本项目仅供非商业学习、交流与分享。对于他人违反许可证或侵犯第三方权利的使用行为及其后果，作者概不承担任何责任。
// This project is provided solely for noncommercial learning, discussion, and sharing. The author assumes no liability whatsoever for others’ use in violation of the license or third-party rights, or for any resulting consequences.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../core.mjs";
const env = {
  ...process.env,
  CODEX_PET_DATA_DIR: path.join(ROOT, "qa/desktop-test-state"),
  CODEX_PET_DESKTOP_USER_DATA: path.join(ROOT, "qa/desktop-test-profile"),
};
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(
  path.join(ROOT, "node_modules/electron/dist/electron.exe"),
  [path.join(ROOT, "desktop/main.mjs"), "--self-test"],
  { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);
let stdout = "",
  stderr = "";
child.stdout.on("data", (v) => (stdout += v));
child.stderr.on("data", (v) => (stderr += v));
child.on("error", (e) => {
  console.error(e);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  fs.writeFileSync(
    path.join(ROOT, "qa/desktop-launch-test.json"),
    JSON.stringify({ code, signal, stdout, stderr }, null, 2),
  );
  console.log(JSON.stringify({ code, signal, stdout, stderr }));
  process.exitCode = code || 0;
});
