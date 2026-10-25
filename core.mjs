// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 CharlesQueen
// 本项目仅供非商业学习、交流与分享。对于他人违反许可证或侵犯第三方权利的使用行为及其后果，作者概不承担任何责任。
// This project is provided solely for noncommercial learning, discussion, and sharing. The author assumes no liability whatsoever for others’ use in violation of the license or third-party rights, or for any resulting consequences.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
export const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const STATES = [
  "idle",
  "running-right",
  "running-left",
  "waving",
  "jumping",
  "failed",
  "waiting",
  "running",
  "review",
  "looking",
];
export const LABELS = {
  idle: "安静陪伴",
  "running-right": "向右跑",
  "running-left": "向左跑",
  waving: "挥手",
  jumping: "开心跳跃",
  failed: "有点失落",
  waiting: "等你回应",
  running: "专注工作",
  review: "认真检查",
  looking: "四处张望",
};
function configuredDataDirectory() {
  const file = path.join(ROOT, "runtime.json");
  return fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8")).data_directory
    : path.join(ROOT, ".local");
}
export const DATA = process.env.CODEX_PET_DATA_DIR || configuredDataDirectory();
const sleep = (ms) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const idFile = (id, dir) =>
  path.join(
    dir,
    crypto.createHash("sha256").update(id).digest("hex") + ".json",
  );
export function validateState(s) {
  if (!STATES.includes(s)) throw new Error("Unknown animation state");
  return s;
}
function atomicWrite(file, value) {
  const temp = file + "." + process.pid + "." + crypto.randomUUID() + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(value));
  fs.renameSync(temp, file);
}
function transact(id, fn, dir = DATA) {
  if (typeof id !== "string" || !id || id.length > 512)
    throw new Error("Invalid session id");
  fs.mkdirSync(dir, { recursive: true });
  const file = idFile(id, dir),
    lock = file + ".lock";
  let fd;
  const start = Date.now();
  while (fd === undefined) {
    try {
      fd = fs.openSync(lock, "wx");
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      if (Date.now() - start > 800) throw new Error("Companion state is busy");
      sleep(10);
    }
  }
  try {
    let s = {
      session_id: id,
      automatic_state: "idle",
      revision: 0,
      hook_seen: false,
      outfit: manifest().default_outfit || manifest().outfits[0].id,
    };
    if (fs.existsSync(file))
      s = { ...s, ...JSON.parse(fs.readFileSync(file, "utf8")) };
    fn(s);
    s.revision++;
    s.updated_at = Date.now();
    atomicWrite(file, s);
    return snapshot(s);
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}
export function snapshot(s, now = Date.now()) {
  const manual = s.override && s.override.until > now ? s.override : null;
  const pulse = s.pulse && s.pulse.until > now ? s.pulse : null;
  const state =
    pulse && manual?.source !== "preview"
      ? pulse.state
      : manual?.state || s.automatic_state || "idle";
  return {
    session_id: s.session_id,
    state,
    label: LABELS[state],
    outfit: s.outfit || manifest().default_outfit || manifest().outfits[0].id,
    revision: s.revision || 0,
    source:
      pulse && manual?.source !== "preview"
        ? "hook"
        : manual?.source || (s.hook_seen ? "hook" : "unconnected"),
    hook_seen: !!s.hook_seen,
    hook_event: s.hook_event || null,
    mode: manual ? "manual" : "auto",
    updated_at: s.updated_at || null,
  };
}
export function sessionIds(dir = DATA) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => /^[a-f0-9]{64}\.json$/.test(n))
    .map((n) => JSON.parse(fs.readFileSync(path.join(dir, n), "utf8")))
    .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
}
export function status(id, dir = DATA) {
  const sessions = sessionIds(dir);
  id =
    id ||
    (sessions.find((s) => s.hook_seen) || sessions[0])?.session_id ||
    "default";
  const file = idFile(id, dir);
  return snapshot(
    fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, "utf8"))
      : { session_id: id },
  );
}
export function setState(
  { session_id, state, mode = "once", duration_ms, outfit },
  source = "model",
  dir = DATA,
) {
  duration_ms ??= mode === "hold" ? 300000 : 4000;
  if (mode !== "auto") validateState(state);
  if (!["auto", "once", "hold"].includes(mode))
    throw new Error("Invalid control mode");
  if (
    !Number.isInteger(duration_ms) ||
    duration_ms < 200 ||
    duration_ms > 300000
  )
    throw new Error("Duration must be200..300000ms");
  if (
    outfit !== undefined &&
    !manifest().outfits.some((item) => item.id === outfit)
  )
    throw new Error("Unknown outfit");
  const id = session_id || status(undefined, dir).session_id;
  return transact(
    id,
    (s) => {
      if (outfit) s.outfit = outfit;
      if (mode === "auto") delete s.override;
      else
        s.override = { state, mode, source, until: Date.now() + duration_ms };
    },
    dir,
  );
}
export function applyHook(event, dir = DATA) {
  const name = event.hook_event_name;
  const id = event.session_id;
  if (!id || typeof id !== "string") return null;
  // Ignore this plugin’s controls to prevent status feedback.
  // 忽略插件自身的控制工具，避免状态循环。
  if (
    /(?:codex_pet|codex-pet|pet_(?:open|status|set_state|animation|preview))/.test(
      event.tool_name || "",
    )
  )
    return status(id, dir);
  const supported = [
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "PermissionRequest",
    "Stop",
    "Interrupt",
    "SessionEnd",
  ];
  if (!supported.includes(name)) return null;
  return transact(
    id,
    (s) => {
      s.hook_seen = true;
      s.hook_event = name;
      if (["SessionStart", "UserPromptSubmit"].includes(name)) {
        delete s.override;
        delete s.pulse;
      }
      if (name === "SessionStart") s.automatic_state = "idle";
      if (name === "UserPromptSubmit" || name === "PreToolUse")
        s.automatic_state = "running";
      if (name === "PermissionRequest") s.automatic_state = "waiting";
      if (name === "PostToolUse") {
        const v = event.tool_response || {};
        const code =
          v.exit_code ??
          v.exitCode ??
          v.result?.exit_code ??
          v.structuredContent?.exit_code;
        if (v.isError === true || (typeof code === "number" && code !== 0))
          s.pulse = { state: "failed", until: Date.now() + 4000 };
        s.automatic_state = "running";
      }
      if (["Stop", "Interrupt", "SessionEnd"].includes(name)) {
        s.automatic_state = "idle";
        delete s.pulse;
        if (
          s.override?.mode === "hold" &&
          s.override.source === "model" &&
          (name !== "Stop" || s.override.state !== "waiting")
        )
          delete s.override;
      }
    },
    dir,
  );
}
export function manifest() {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, "assets", "manifest.json"), "utf8"),
  );
}
// All states in an outfit share one canvas and registration. / 同套服饰的动作共享画布与定位。
export function assetPath({
  state = "idle",
  outfit,
  frame_index,
  still = false,
}) {
  validateState(state);
  const m = manifest();
  outfit ??= m.default_outfit || m.outfits[0].id;
  if (!m.outfits.some((item) => item.id === outfit))
    throw new Error("Unknown outfit");
  if (frame_index !== undefined) {
    if (
      state !== "looking" ||
      !Number.isInteger(frame_index) ||
      frame_index < 0 ||
      frame_index > 15
    )
      throw new Error("Look frame must be 0..15");
    return path.join(
      ROOT,
      "assets",
      outfit,
      "look",
      String(frame_index).padStart(2, "0") + ".png",
    );
  }
  return path.join(
    ROOT,
    "assets",
    outfit,
    state + (still ? "-still.png" : ".png"),
  );
}
const assetHashes = new Map();
export function animation({
  state = "idle",
  outfit,
  frame_index,
  still = false,
  offset = 0,
}) {
  const m = manifest(),
    info = m.animations[state],
    file = assetPath({ state, outfit, frame_index, still });
  const stat = fs.statSync(file);
  if (!Number.isInteger(offset) || offset < 0 || offset >= stat.size)
    throw new Error("Invalid animation chunk offset");
  const key = file + ":" + stat.mtimeMs + ":" + stat.size;
  if (!assetHashes.has(key))
    assetHashes.set(
      key,
      crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
    );
  const buffer = Buffer.alloc(Math.min(524288, stat.size - offset));
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, buffer, 0, buffer.length, offset);
  } finally {
    fs.closeSync(fd);
  }
  return {
    content: [{ type: "text", text: "Animation chunk ready." }],
    structuredContent: {
      state,
      width: m.canvas[0],
      height: m.canvas[1],
      frames: frame_index !== undefined || still ? 1 : info.frames,
    },
    _meta: {
      animation: {
        mimeType: "image/png",
        offset,
        totalBytes: stat.size,
        sha256: assetHashes.get(key),
        data: buffer.toString("base64"),
      },
    },
  };
}
