// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 CharlesQueen
// 本项目仅供非商业学习、交流与分享。对于他人违反许可证或侵犯第三方权利的使用行为及其后果，作者概不承担任何责任。
// This project is provided solely for noncommercial learning, discussion, and sharing. The author assumes no liability whatsoever for others’ use in violation of the license or third-party rights, or for any resulting consequences.

import { build } from "esbuild";
import { ROOT } from "./core.mjs";
import path from "node:path";
import fs from "node:fs/promises";
await build({
  entryPoints: [path.join(ROOT, "web/ui.mjs")],
  outfile: path.join(ROOT, "dist/ui.js"),
  bundle: true,
  format: "esm",
  minify: true,
  target: "es2022",
});
if (process.argv.includes("--release")) {
  const release = path.join(ROOT, "release/codex-desktop-pet");
  await fs.mkdir(release, { recursive: true });
  const files = [
    ".codex-plugin/plugin.json",
    ".mcp.json",
    "runtime.json",
    "desktop-lifecycle.mjs",
    "core.mjs",
    "i18n.mjs",
    "hooks/bridge.mjs",
    "hooks/hooks.json",
    "web/index.html",
    "dist/ui.js",
    "skills/codex-pet-control/SKILL.md",
    "scripts/start-preview.ps1",
    "README.md",
    "README.zh-CN.md",
    "LICENSE.md",
    "NOTICE.md",
    "assets/RIGHTS.md",
  ];
  for (const file of files) {
    const target = path.join(release, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(ROOT, file), target);
  }
  await fs.cp(path.join(ROOT, "assets"), path.join(release, "assets"), {
    recursive: true,
  });
  await build({
    entryPoints: [path.join(ROOT, "server.mjs")],
    outfile: path.join(release, "server.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    banner: {
      js: "import {createRequire as createLocalRequire} from 'node:module';const require=createLocalRequire(import.meta.url);",
    },
  });
  const marketplace = path.join(ROOT, "release/.agents/plugins");
  await fs.mkdir(marketplace, { recursive: true });
  await fs.writeFile(
    path.join(marketplace, "marketplace.json"),
    JSON.stringify(
      {
        name: "codex-pet-local",
        plugins: [
          {
            name: "codex-desktop-pet",
            source: { source: "local", path: "./codex-desktop-pet" },
            policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
            category: "Productivity",
          },
        ],
      },
      null,
      2,
    ),
  );
  console.log("Local plugin package built / 本地插件包已构建");
}
