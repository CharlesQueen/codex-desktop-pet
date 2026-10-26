// Author: CharlesQueen
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 CharlesQueen
// 本项目仅供非商业学习、交流与分享。对于他人违反许可证或侵犯第三方权利的使用行为及其后果，作者概不承担任何责任。
// This project is provided solely for noncommercial learning, discussion, and sharing. The author assumes no liability whatsoever for others’ use in violation of the license or third-party rights, or for any resulting consequences.

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  ROOT,
  STATES,
  LABELS,
  status,
  setState,
  animation,
  manifest,
} from "./core.mjs";
import { attachDesktopHost } from "./desktop-lifecycle.mjs";
const URI = "ui://codex-pet/companion-v1.html";
const result = (x) => ({
  content: [{ type: "text", text: JSON.stringify(x) }],
  structuredContent: x,
});
export function html(previewToken) {
  const script = fs
    .readFileSync(path.join(ROOT, "dist", "ui.js"), "utf8")
    .replaceAll("</script", "<\\/script");
  return fs
    .readFileSync(path.join(ROOT, "web", "index.html"), "utf8")
    .replace("/*BUNDLE*/", () => script)
    .replace("/*PREVIEW*/", () => JSON.stringify(previewToken || null));
}
export async function invoke(name, args = {}) {
  if (name === "pet_open")
    return result({
      ...status(args.session_id),
      states: STATES.map((value) => ({ value, label: LABELS[value] })),
      outfits: manifest().outfits.map((o) => ({
        value: o.id,
        label: o.label,
        label_en: o.label_en,
      })),
      canvas: manifest().canvas,
    });
  if (name === "pet_status") return result(status(args.session_id));
  if (name === "pet_set_state") return result(setState(args, "model"));
  if (name === "pet_preview") return result(setState(args, "preview"));
  if (name === "pet_animation") return animation(args);
  throw new Error("Unknown companion tool");
}
export function createMcpServer() {
  const server = new McpServer({ name: "codex-desktop-pet", version: "0.2.0" });
  const control = {
    session_id: z.string().max(512).optional(),
    state: z.enum(STATES).optional(),
    mode: z.enum(["auto", "once", "hold"]).default("once"),
    duration_ms: z.number().int().min(200).max(300000).optional(),
    outfit: z.string().optional(),
  };
  server.registerResource(
    "codex-pet-companion",
    URI,
    { mimeType: "text/html;profile=mcp-app" },
    async () => ({
      contents: [
        {
          uri: URI,
          mimeType: "text/html;profile=mcp-app",
          text: html(),
          _meta: {
            ui: {
              prefersBorder: false,
              csp: { connectDomains: [], resourceDomains: [] },
            },
          },
        },
      ],
    }),
  );
  const specs = [
    [
      "pet_open",
      "Open pet / 打开桌宠",
      "Open the high-resolution companion in this conversation panel. Returns the session id for later controls.",
      { session_id: z.string().optional() },
      false,
      {
        ui: { resourceUri: URI },
        "openai/ui": { entrypoints: [{ type: "thread" }] },
      },
    ],
    [
      "pet_status",
      "Pet status / 桌宠状态",
      "Read the current companion state and session id. Does not read conversation text.",
      { session_id: z.string().optional() },
      true,
      {},
    ],
    [
      "pet_set_state",
      "Pet action / 切换动作",
      "Set this companion animation: running means focused work, not literal running. Pass the session id returned by pet_open/status. Use review for inspection and waiting for user input. Auto releases the override.",
      control,
      false,
      {},
    ],
    [
      "pet_preview",
      "Preview action / 预览动作",
      "UI-only manual preview or return to automatic following.",
      control,
      false,
      { ui: { visibility: ["app"] } },
    ],
    [
      "pet_animation",
      "Load animation / 加载动画",
      "UI-only local lossless animation asset. Image bytes are returned only in private metadata.",
      {
        state: z.enum(STATES),
        outfit: z.string().optional(),
        frame_index: z.number().int().min(0).max(15).optional(),
        still: z.boolean().optional(),
        offset: z.number().int().min(0).optional(),
      },
      true,
      { ui: { visibility: ["app"] } },
    ],
  ];
  for (const [
    name,
    title,
    description,
    inputSchema,
    readOnlyHint,
    _meta,
  ] of specs)
    server.registerTool(
      name,
      {
        title,
        description,
        inputSchema,
        annotations: {
          readOnlyHint,
          destructiveHint: false,
          openWorldHint: false,
        },
        _meta,
      },
      async (args) => {
        try {
          return await invoke(name, args);
        } catch (e) {
          return {
            isError: true,
            content: [{ type: "text", text: e.message }],
          };
        }
      },
    );
  return server;
}
export async function startPreview(port = 0) {
  const token = crypto.randomBytes(32).toString("hex");
  const server = http.createServer(async (req, res) => {
    const origin = "http://127.0.0.1:" + server.address().port;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.headers.host !== "127.0.0.1:" + server.address().port) {
      res.writeHead(403).end();
      return;
    }
    if (req.method === "GET" && req.url === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(html(token));
      return;
    }
    if (
      req.method !== "POST" ||
      req.url !== "/api/tool" ||
      req.headers["x-pet-token"] !== token ||
      (req.headers.origin && req.headers.origin !== origin)
    ) {
      res.writeHead(403).end();
      return;
    }
    try {
      let data = "";
      for await (const c of req) {
        data += c;
        if (data.length > 16384) throw new Error("Request too large");
      }
      const { name, args } = JSON.parse(data);
      if (
        !["pet_open", "pet_status", "pet_animation", "pet_preview"].includes(
          name,
        )
      )
        throw new Error("Tool unavailable in preview");
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(await invoke(name, args)));
    } catch (e) {
      res
        .writeHead(400, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: e.message }));
    }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { server, url: "http://127.0.0.1:" + server.address().port };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  if (process.argv.includes("--preview")) {
    const { url } = await startPreview(
      Number(process.env.CODEX_PET_PREVIEW_PORT || 0),
    );
    console.log(url);
  } else {
    const server = createMcpServer();
    let release = () => {};
    server.server.oninitialized = () => {
      release = attachDesktopHost();
    };
    server.server.onclose = () => release();
    process.stdin.once("end", () => release());
    await server.connect(new StdioServerTransport());
  }
}
