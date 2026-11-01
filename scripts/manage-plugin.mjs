// Author: CharlesQueen
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 CharlesQueen
// 本项目仅供非商业学习、交流与分享。对于他人违反许可证或侵犯第三方权利的使用行为及其后果，作者概不承担任何责任。
// This project is provided solely for noncommercial learning, discussion, and sharing. The author assumes no liability whatsoever for others’ use in violation of the license or third-party rights, or for any resulting consequences.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ROOT, DATA } from "../core.mjs";
import { withCodexBackend } from "./codex-backend.mjs";
export const PLUGIN_ID = "codex-desktop-pet@codex-pet-local";
const marker = path.join(DATA, "installation.json"),
  marketplace = "codex-pet-local";
const run = (args) =>
  JSON.parse(
    execFileSync("codex", args, {
      encoding: "utf8",
      windowsHide: true,
      env: process.env,
    }),
  );
function save(value) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(marker, JSON.stringify(value, null, 2));
  return value;
}
function canonical(value) {
  return path.resolve(value.replace(/^\\\\\?\\/, "")).toLowerCase();
}
export async function register() {
  // Retire only the legacy name that points to this checkout. / 只迁移指向当前项目的旧来源。
  await withCodexBackend(async (request) => {
    const { config } = await request("config/read", { includeLayers: false });
    const sources = config.marketplaces || {};
    const old = sources["sora-local"];
    if (
      old?.source_type === "local" &&
      canonical(old.source) === canonical(path.join(ROOT, "release"))
    ) {
      run(["plugin", "marketplace", "remove", "sora-local", "--json"]);
      if (config.plugins?.["sora-hd-companion@sora-local"])
        await request("config/batchWrite", {
          edits: [
            {
              keyPath: 'plugins."sora-hd-companion@sora-local".enabled',
              mergeStrategy: "upsert",
              value: false,
            },
          ],
          reloadUserConfig: true,
        });
    }
    const current = sources[marketplace];
    if (current && canonical(current.source) !== canonical(ROOT))
      run(["plugin", "marketplace", "remove", marketplace, "--json"]);
  });
  run(["plugin", "marketplace", "add", ROOT, "--json"]);
  const installed = run(["plugin", "add", PLUGIN_ID, "--json"]);
  const state = save({
    pluginId: PLUGIN_ID,
    name: "Codex Desktop Pet",
    version: installed.version,
    installed: true,
    installedPath: installed.installedPath,
    marketplaceRoot: ROOT,
    updatedAt: Date.now(),
  });
  await withCodexBackend(async (request) => {
    const list = await request("plugin/list", {
      cwds: [ROOT],
      marketplaceKinds: ["local"],
      forceRefetch: false,
    });
    const found = list.marketplaces
      .find((item) => item.name === marketplace)
      ?.plugins.find((item) => item.id === PLUGIN_ID);
    if (!found?.installed)
      throw new Error("Codex directory did not return the installed pet");
  });
  return state;
}
export function installation() {
  const saved = fs.existsSync(marker)
    ? JSON.parse(fs.readFileSync(marker, "utf8"))
    : null;
  return saved
    ? {
        ...saved,
        installed:
          saved.installed &&
          fs.existsSync(
            path.join(saved.installedPath, ".codex-plugin/plugin.json"),
          ),
      }
    : { pluginId: PLUGIN_ID, name: "Codex Desktop Pet", installed: false };
}
export async function uninstall() {
  const list = run(["plugin", "list", "--json"]);
  if (list.installed.some((item) => item.pluginId === PLUGIN_ID))
    run(["plugin", "remove", PLUGIN_ID, "--json"]);
  // Removing registration retains settings, assets and unrelated plugins. / 卸载保留设置、资源和其他插件。
  const sources = run(["plugin", "marketplace", "list", "--json"]);
  if (sources.marketplaces.some((item) => item.name === marketplace))
    run(["plugin", "marketplace", "remove", marketplace, "--json"]);
  save({ ...installation(), installed: false, updatedAt: Date.now() });
  if (!process.argv.includes("--from-desktop"))
    execFileSync(
      process.execPath,
      [path.join(ROOT, "scripts/stop-desktop.mjs")],
      { encoding: "utf8", windowsHide: true, env: process.env },
    );
  return { pluginId: PLUGIN_ID, installed: false, settingsRetained: true };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const command = process.argv[2];
  const result =
    command === "register"
      ? await register()
      : command === "uninstall"
        ? await uninstall()
        : command === "status"
          ? installation()
          : null;
  if (!result) throw new Error("Use register, status or uninstall");
  console.log(JSON.stringify(result));
}
