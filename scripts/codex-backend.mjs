// Author: CharlesQueen
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 CharlesQueen
// 本项目仅供非商业学习、交流与分享。对于他人违反许可证或侵犯第三方权利的使用行为及其后果，作者概不承担任何责任。
// This project is provided solely for noncommercial learning, discussion, and sharing. The author assumes no liability whatsoever for others’ use in violation of the license or third-party rights, or for any resulting consequences.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
// Keep management requests separate from model conversations. / 管理请求不创建模型会话。
export async function withCodexBackend(action) {
  const child = spawn("codex", ["app-server", "--stdio"], {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  });
  const pending = new Map();
  let id = 0,
    diagnostic = "";
  child.stderr.on(
    "data",
    (chunk) => (diagnostic = (diagnostic + chunk).slice(-3000)),
  );
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    const response = JSON.parse(line),
      entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id);
    clearTimeout(entry.timer);
    response.error
      ? entry.reject(new Error(response.error.message))
      : entry.resolve(response.result);
  });
  child.on("error", (error) => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    pending.clear();
  });
  child.on("exit", () => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(
        new Error("Codex management connection ended: " + diagnostic),
      );
    }
    pending.clear();
  });
  function request(method, params) {
    return new Promise((resolve, reject) => {
      const key = ++id,
        timer = setTimeout(() => {
          pending.delete(key);
          reject(new Error("Codex request timed out: " + method));
        }, 30000);
      pending.set(key, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id: key, method, params }) + "\n");
    });
  }
  try {
    await request("initialize", {
      clientInfo: { name: "codex-pet-manager", version: "0.2.2" },
      capabilities: { experimentalApi: true },
    });
    child.stdin.write(JSON.stringify({ method: "initialized" }) + "\n");
    return await action(request);
  } finally {
    lines.close();
    child.stdin.end();
    child.kill();
  }
}
