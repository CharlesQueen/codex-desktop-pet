// Author: CharlesQueen
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import fs from "node:fs";
// 本项目仅供非商业学习、交流与分享。对于他人违反许可证或侵犯第三方权利的使用行为及其后果，作者概不承担任何责任。
// This project is provided solely for noncommercial learning, discussion, and sharing. The author assumes no liability whatsoever for others’ use in violation of the license or third-party rights, or for any resulting consequences.
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { ROOT } from "../core.mjs";
const home = path.join(ROOT, "qa/installation-" + Date.now()),
  codexHome = path.join(home, "codex"),
  data = path.join(home, "state"),
  profile = path.join(home, "desktop");
fs.mkdirSync(codexHome, { recursive: true });
const env = {
  ...process.env,
  CODEX_HOME: codexHome,
  CODEX_PET_DATA_DIR: data,
  CODEX_PET_DESKTOP_USER_DATA: profile,
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.CODEX_PET_DESKTOP_AUTOSTART;
const run = (command, args) =>
  execFileSync(command, args, {
    cwd: ROOT,
    env,
    encoding: "utf8",
    windowsHide: true,
    timeout: 45000,
  });
const json = (command, args) => JSON.parse(run(command, args));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check) {
  for (let n = 0; n < 100; n++) {
    if (check()) return;
    await wait(100);
  }
  throw new Error("Installation lifecycle check timed out");
}
const report = () =>
  JSON.parse(fs.readFileSync(path.join(profile, "window-status.json"), "utf8"));
const gone = (pid) => {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if (error.code === "ESRCH") return true;
    throw error;
  }
};
fs.mkdirSync(profile, { recursive: true });
fs.writeFileSync(
  path.join(profile, "settings.json"),
  JSON.stringify({
    height: 320,
    locale: "zh",
    session_id: "installation-test",
  }),
);
const legacySource = "\\\\?\\" + path.join(ROOT, "release");
fs.writeFileSync(
  path.join(codexHome, "config.toml"),
  '[marketplaces.sora-local]\nsource_type="local"\nsource=' +
    JSON.stringify(legacySource) +
    '\n[plugins."sora-hd-companion@sora-local"]\nenabled=true\n',
);
const other = path.join(home, "other");
fs.mkdirSync(path.join(other, ".agents/plugins"), { recursive: true });
fs.mkdirSync(path.join(other, "plugin/.codex-plugin"), { recursive: true });
fs.writeFileSync(
  path.join(other, "plugin/.codex-plugin/plugin.json"),
  JSON.stringify({
    name: "unrelated-test",
    version: "1.0.0",
    description: "Unrelated fixture",
  }),
);
fs.writeFileSync(
  path.join(other, ".agents/plugins/marketplace.json"),
  JSON.stringify({
    name: "unrelated-test",
    plugins: [
      {
        name: "unrelated-test",
        source: { source: "local", path: "./plugin" },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      },
    ],
  }),
);
json("codex", ["plugin", "marketplace", "add", other, "--json"]);
const unrelated = json("codex", [
  "plugin",
  "add",
  "unrelated-test@unrelated-test",
  "--json",
]);
const installed = json(process.execPath, [
  "scripts/manage-plugin.mjs",
  "register",
]);
assert.equal(installed.version, "0.2.2");
assert.ok(installed.installed);
const config = fs.readFileSync(path.join(codexHome, "config.toml"), "utf8");
assert.ok(!config.includes("[marketplaces.sora-local]"));
assert.ok(config.includes("sora-hd-companion@sora-local"));
assert.match(config, /enabled\s*=\s*false/);
run(process.execPath, ["scripts/start-desktop.mjs"]);
await until(
  () =>
    fs.existsSync(path.join(profile, "window-status.json")) && report().visible,
);
const first = report().pid;
assert.ok(report().painted);
const manager = spawn(
  path.join(ROOT, "node_modules/electron/dist/electron.exe"),
  [path.join(ROOT, "desktop/main.mjs"), "--manage"],
  { cwd: ROOT, env, windowsHide: true, stdio: "ignore" },
);
await new Promise((resolve, reject) => {
  manager.on("exit", resolve);
  manager.on("error", reject);
});
await until(() => report().managementVisible === true);
// Native client uninstall removes cache; the visible pet must notice it. / 原生客户端卸载移除缓存后，桌宠必须退出。
json("codex", [
  "plugin",
  "remove",
  "codex-desktop-pet@codex-pet-local",
  "--json",
]);
await until(() => gone(first));
assert.equal(report().exitReason, "plugin-uninstalled");
assert.ok(fs.existsSync(path.join(profile, "settings.json")));
const removed = json(process.execPath, [
  "scripts/manage-plugin.mjs",
  "uninstall",
]);
assert.equal(removed.installed, false);
assert.ok(removed.settingsRetained);
assert.ok(fs.existsSync(unrelated.installedPath));
const reinstalled = json(process.execPath, [
  "scripts/manage-plugin.mjs",
  "register",
]);
assert.equal(reinstalled.pluginId, installed.pluginId);
run(process.execPath, ["scripts/start-desktop.mjs"]);
const second = report().pid;
assert.notEqual(second, first);
json(process.execPath, ["scripts/manage-plugin.mjs", "uninstall"]);
await until(() => gone(second));
assert.ok(fs.existsSync(unrelated.installedPath));
assert.ok(fs.existsSync(path.join(ROOT, "assets/white/waiting.png")));
const result = {
  ok: true,
  checks: [
    "legacy source migrated",
    "stable directory entry installed",
    "native management window visible",
    "native client uninstall closes pet",
    "settings retained",
    "unrelated plugin retained",
    "same identity reinstalls",
    "helper uninstall closes pet",
  ],
};
fs.writeFileSync(
  path.join(ROOT, "qa/installation-management-verification.json"),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));
