// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 CharlesQueen
// 本项目仅供非商业学习、交流与分享。对于他人违反许可证或侵犯第三方权利的使用行为及其后果，作者概不承担任何责任。
// This project is provided solely for noncommercial learning, discussion, and sharing. The author assumes no liability whatsoever for others’ use in violation of the license or third-party rights, or for any resulting consequences.

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ROOT } from "../core.mjs";
test("real SDK stdio handshake, UI resource and private HD image transport", async () => {
  const client = new Client({ name: "pet-test", version: "1.0.0" });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pet-mcp-"));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [process.env.CODEX_PET_TEST_SERVER || path.join(ROOT, "server.mjs")],
    env: { ...process.env, CODEX_PET_DATA_DIR: dir },
    stderr: "pipe",
  });
  let diagnostics = "";
  transport.stderr?.on("data", (v) => (diagnostics += v));
  try {
    await client.connect(transport);
    const list = await client.listTools();
    assert.equal(list.tools.length, 5);
    const open = list.tools.find((t) => t.name === "pet_open");
    assert.equal(open._meta.ui.resourceUri, "ui://codex-pet/companion-v1.html");
    assert.deepEqual(open._meta["openai/ui"].entrypoints, [{ type: "thread" }]);
    const ui = await client.readResource({ uri: open._meta.ui.resourceUri });
    assert.equal(ui.contents[0].mimeType, "text/html;profile=mcp-app");
    assert.ok(ui.contents[0].text.includes("Codex Desktop Pet"));
    assert.ok(!ui.contents[0].text.includes("/*BUNDLE*/"));
    const start = await client.callTool({
      name: "pet_open",
      arguments: { session_id: "test-a" },
    });
    assert.equal(start.structuredContent.session_id, "test-a");
    const set = await client.callTool({
      name: "pet_set_state",
      arguments: { session_id: "test-a", state: "review", mode: "hold" },
    });
    assert.equal(set.structuredContent.state, "review");
    const other = await client.callTool({
      name: "pet_status",
      arguments: { session_id: "test-b" },
    });
    assert.equal(other.structuredContent.state, "idle");
    const bad = await client.callTool({
      name: "pet_animation",
      arguments: { state: "looking", frame_index: 99 },
    });
    assert.equal(bad.isError, true);
    const image = await client.callTool({
      name: "pet_animation",
      arguments: { state: "jumping" },
    });
    const data = Buffer.from(image._meta.animation.data, "base64");
    assert.equal(data.subarray(1, 4).toString(), "PNG");
    assert.ok(image.structuredContent.width > 1000);
    assert.equal(image.structuredContent.frames, 12);
    assert.ok(image._meta.animation.totalBytes > data.length);
    const chunks = [data];
    for (
      let offset = data.length;
      offset < image._meta.animation.totalBytes;
      offset += 524288
    ) {
      const part = await client.callTool({
        name: "pet_animation",
        arguments: { state: "jumping", offset },
      });
      chunks.push(Buffer.from(part._meta.animation.data, "base64"));
    }
    assert.equal(
      crypto.createHash("sha256").update(Buffer.concat(chunks)).digest("hex"),
      image._meta.animation.sha256,
    );
    assert.ok(!JSON.stringify(image.content).includes("base64"));
    assert.ok(!JSON.stringify(image.structuredContent).includes("base64"));
    assert.equal(diagnostics, "");
  } catch (e) {
    e.message += "; server diagnostics: " + diagnostics;
    throw e;
  } finally {
    await client.close();
  }
});

test("installed hook process transmits lifecycle states to installed MCP server", async () => {
  const entry =
    process.env.CODEX_PET_TEST_SERVER || path.join(ROOT, "server.mjs");
  const bridge = path.join(path.dirname(entry), "hooks/bridge.mjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pet-installed-hooks-"));
  const client = new Client({ name: "pet-hook-test", version: "0.1.2" });
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [entry],
        env: { ...process.env, CODEX_PET_DATA_DIR: dir },
        stderr: "pipe",
      }),
    );
    for (const [event, state] of [
      ["SessionStart", "idle"],
      ["UserPromptSubmit", "running"],
      ["PreToolUse", "running"],
      ["PermissionRequest", "waiting"],
      ["PostToolUse", "running"],
      ["Stop", "idle"],
    ]) {
      const p = spawnSync(process.execPath, [bridge], {
        input: JSON.stringify({
          session_id: "installed-hook-test",
          hook_event_name: event,
          tool_name: "test.readonly",
          tool_response: { exit_code: 0 },
        }),
        env: { ...process.env, CODEX_PET_DATA_DIR: dir },
        encoding: "utf8",
      });
      assert.equal(p.status, 0);
      assert.equal(p.stdout, "");
      assert.equal(p.stderr, "");
      const value = await client.callTool({
        name: "pet_status",
        arguments: { session_id: "installed-hook-test" },
      });
      assert.equal(value.structuredContent.state, state);
      assert.equal(value.structuredContent.hook_seen, true);
      assert.equal(value.structuredContent.source, "hook");
    }
    const other = await client.callTool({
      name: "pet_status",
      arguments: { session_id: "unrelated-chat" },
    });
    assert.equal(other.structuredContent.hook_seen, false);
  } finally {
    await client.close();
  }
});
