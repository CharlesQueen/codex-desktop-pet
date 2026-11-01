// Author: CharlesQueen
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 CharlesQueen
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// User visibility is independent of work state and survives host reconnects.
// 用户的显示选择独立于工作状态，并在连接重建后保留。
function preferencePath(directory) {
  return path.join(
    process.env.CODEX_PET_DESKTOP_USER_DATA ||
      path.join(directory, ".local", "desktop"),
    "visibility.json",
  );
}
export function readVisibility(directory) {
  const file = preferencePath(directory);
  return fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8")).mode
    : "shown";
}
export function writeVisibility(directory, mode) {
  if (!["shown", "hidden", "exited"].includes(mode))
    throw new Error("Unknown visibility mode");
  const file = preferencePath(directory);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + "." + crypto.randomUUID() + ".tmp";
  fs.writeFileSync(temporary, JSON.stringify({ mode }, null, 2));
  fs.renameSync(temporary, file);
}
