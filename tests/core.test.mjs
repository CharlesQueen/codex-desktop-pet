// Author: CharlesQueen
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 CharlesQueen
// 本项目仅供非商业学习、交流与分享。对于他人违反许可证或侵犯第三方权利的使用行为及其后果，作者概不承担任何责任。
// This project is provided solely for noncommercial learning, discussion, and sharing. The author assumes no liability whatsoever for others’ use in violation of the license or third-party rights, or for any resulting consequences.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { applyHook, status, setState, snapshot, ROOT } from "../core.mjs";
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), "pet-core-"));
test("hook lifecycle remains passive and isolates sessions", () => {
  const dir = temp();
  for (const [e, expected] of [
    ["SessionStart", "idle"],
    ["UserPromptSubmit", "running"],
    ["PermissionRequest", "waiting"],
    ["PreToolUse", "running"],
    ["Stop", "idle"],
    ["Interrupt", "idle"],
  ]) {
    applyHook({ session_id: "chat-a", hook_event_name: e }, dir);
    assert.equal(status("chat-a", dir).state, expected);
  }
  applyHook({ session_id: "chat-b", hook_event_name: "UserPromptSubmit" }, dir);
  assert.equal(status("chat-a", dir).state, "idle");
  assert.equal(status("chat-b", dir).state, "running");
});
test("failures are explicit and transient, no text guessing", () => {
  const dir = temp();
  applyHook(
    {
      session_id: "a",
      hook_event_name: "PostToolUse",
      tool_response: { exit_code: 2 },
    },
    dir,
  );
  assert.equal(status("a", dir).state, "failed");
  const [f] = fs.readdirSync(dir).filter((x) => x.endsWith(".json"));
  const raw = JSON.parse(fs.readFileSync(path.join(dir, f)));
  assert.equal(snapshot(raw, Date.now() + 5000).state, "running");
  applyHook(
    {
      session_id: "b",
      hook_event_name: "PostToolUse",
      tool_response: { output: "error is just an example", exit_code: 0 },
    },
    dir,
  );
  assert.equal(status("b", dir).state, "running");
});
test("phase controls expire and cannot alter approval or leak transcript data", () => {
  const dir = temp();
  setState(
    { session_id: "a", state: "review", mode: "hold", duration_ms: 60000 },
    "model",
    dir,
  );
  applyHook(
    {
      session_id: "a",
      hook_event_name: "PreToolUse",
      tool_input: { secret: "not saved" },
      transcript_path: "not saved",
    },
    dir,
  );
  assert.equal(status("a", dir).state, "review");
  applyHook({ session_id: "a", hook_event_name: "Stop" }, dir);
  assert.equal(status("a", dir).state, "idle");
  for (const f of fs.readdirSync(dir))
    assert.ok(
      !fs.readFileSync(path.join(dir, f), "utf8").includes("not saved"),
    );
  assert.throws(() => setState({ state: "unknown" }, "model", dir));
  assert.throws(() =>
    setState({ state: "idle", outfit: "missing" }, "model", dir),
  );
});
test("own tools do not feed back into running state", () => {
  const dir = temp();
  applyHook({ session_id: "a", hook_event_name: "SessionStart" }, dir);
  applyHook(
    {
      session_id: "a",
      hook_event_name: "PreToolUse",
      tool_name: "mcp__codex_pet__pet_status",
    },
    dir,
  );
  assert.equal(status("a", dir).state, "idle");
});
test("concurrent hook processes preserve every state revision", async () => {
  const dir = temp();
  const jobs = Array.from(
    { length: 12 },
    () =>
      new Promise((resolve, reject) => {
        const p = spawn(
          process.execPath,
          [path.join(ROOT, "hooks/bridge.mjs")],
          {
            env: { ...process.env, CODEX_PET_DATA_DIR: dir },
            stdio: ["pipe", "pipe", "pipe"],
          },
        );
        let out = "",
          err = "";
        p.stdout.on("data", (x) => (out += x));
        p.stderr.on("data", (x) => (err += x));
        p.on("error", reject);
        p.on("exit", (code) => {
          try {
            assert.equal(code, 0, err);
            assert.equal(out, "");
            assert.equal(err, "");
            resolve();
          } catch (e) {
            reject(e);
          }
        });
        p.stdin.end(
          JSON.stringify({ session_id: "a", hook_event_name: "PreToolUse" }),
        );
      }),
  );
  await Promise.all(jobs);
  assert.equal(status("a", dir).revision, 12);
});

test("waiting for user persists across turn end and clears on next prompt", () => {
  const dir = temp();
  setState({ session_id: "a", state: "waiting", mode: "hold" }, "model", dir);
  applyHook({ session_id: "a", hook_event_name: "Stop" }, dir);
  assert.equal(status("a", dir).state, "waiting");
  applyHook({ session_id: "a", hook_event_name: "UserPromptSubmit" }, dir);
  assert.equal(status("a", dir).state, "running");
});
