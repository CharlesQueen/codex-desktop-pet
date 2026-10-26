// Author: CharlesQueen
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 CharlesQueen
// 本项目仅供非商业学习、交流与分享。对于他人违反许可证或侵犯第三方权利的使用行为及其后果，作者概不承担任何责任。
// This project is provided solely for noncommercial learning, discussion, and sharing. The author assumes no liability whatsoever for others’ use in violation of the license or third-party rights, or for any resulting consequences.

import { App } from "@modelcontextprotocol/ext-apps";
import { language, translate, outfitLabel } from "../i18n.mjs";
const $ = (id) => document.getElementById(id);
let app,
  session,
  latest,
  seq = 0,
  desiredKey = "",
  pointerIndex,
  locked = false,
  initial;
let locale = language(
  localStorage.getItem("codex-pet-language") || navigator.language,
);
const pending = new Map(),
  cache = new Map();
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const t = (key) => translate(locale, key);
async function call(name, args = {}) {
  let result;
  if (window.__CODEX_PET_PREVIEW_TOKEN__) {
    const response = await fetch("/api/tool", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pet-Token": window.__CODEX_PET_PREVIEW_TOKEN__,
      },
      body: JSON.stringify({ name, args }),
    });
    if (!response.ok) throw new Error(t("connectionError"));
    result = await response.json();
  } else result = await app.callServerTool({ name, arguments: args });
  if (result.isError) throw new Error(result.content[0].text);
  return result;
}
// Assemble native APNG chunks without resizing. / 分块组装原始 APNG，不缩放图片。
async function imageFor(state, index) {
  const outfit = latest.outfit,
    key = outfit + ":" + state + ":" + (index ?? "animation") + ":" + reduced;
  if (cache.has(key)) return cache.get(key);
  if (pending.has(key)) return pending.get(key);
  const job = (async () => {
    const args = {
      state,
      outfit,
      ...(index === undefined ? { still: reduced } : { frame_index: index }),
    };
    const first = (await call("pet_animation", args))._meta.animation;
    const bytes = new Uint8Array(first.totalBytes);
    function put(chunk) {
      const decoded = Uint8Array.from(atob(chunk.data), (c) => c.charCodeAt(0));
      bytes.set(decoded, chunk.offset);
      return decoded.length;
    }
    let offset = put(first);
    while (offset < bytes.length) {
      const offsets = [offset];
      if (offset + 524288 < bytes.length) offsets.push(offset + 524288);
      const results = await Promise.all(
        offsets.map((offset) => call("pet_animation", { ...args, offset })),
      );
      for (const result of results) put(result._meta.animation);
      offset += offsets.length * 524288;
    }
    const url = URL.createObjectURL(
      new Blob([bytes], { type: first.mimeType }),
    );
    const image = new Image();
    image.src = url;
    await image.decode();
    cache.set(key, url);
    if (cache.size > 4) {
      const oldest = cache.keys().next().value;
      URL.revokeObjectURL(cache.get(oldest));
      cache.delete(oldest);
    }
    return url;
  })();
  pending.set(key, job);
  try {
    return await job;
  } finally {
    pending.delete(key);
  }
}
async function show(state, index) {
  const key = latest.outfit + ":" + state + ":" + (index ?? "animation");
  if (key === desiredKey) return;
  desiredKey = key;
  const ticket = ++seq;
  try {
    const src = await imageFor(state, index);
    if (ticket !== seq) return;
    $("pet").src = src;
    $("error").textContent = "";
  } catch (error) {
    if (ticket === seq) {
      desiredKey = "";
      $("error").textContent = error.message;
    }
  }
}
function localize() {
  document.documentElement.lang = locale;
  $("name").textContent = t("name");
  $("subtitle").textContent = t("subtitle");
  $("auto").textContent = t("auto");
  $("size-label").textContent = t("size");
  $("size").setAttribute("aria-label", t("size"));
  $("background").textContent = t("background");
  $("preview-label").textContent = t("preview");
  $("pet").alt = t("name");
  $("outfit").setAttribute("aria-label", t("outfit"));
  $("language").value = locale;
  if (initial) {
    $("actions").replaceChildren();
    for (const item of initial.states) {
      const button = document.createElement("button");
      button.textContent = t(item.value);
      button.onclick = () => control(item.value);
      $("actions").append(button);
    }
    $("outfit").replaceChildren();
    for (const outfit of initial.outfits) {
      const option = document.createElement("option");
      option.value = outfit.value;
      option.textContent = outfitLabel(outfit, locale);
      $("outfit").append(option);
    }
  }
  if (latest) render(latest);
}
function render(state) {
  latest = state;
  session = state.session_id;
  $("caption").textContent = t(state.state);
  $("outfit").value = state.outfit;
  $("auto").setAttribute("aria-pressed", String(state.mode === "auto"));
  $("message").textContent =
    state.source === "preview"
      ? t("previewing")
      : state.hook_seen
        ? t("connected")
        : t("unconnected");
  if (state.state !== "idle" || state.mode !== "auto") pointerIndex = undefined;
  show(pointerIndex === undefined ? state.state : "looking", pointerIndex);
}
async function refresh() {
  if (locked) return;
  locked = true;
  try {
    const result = await call(
      "pet_status",
      session && session !== "default" ? { session_id: session } : {},
    );
    render(result.structuredContent);
  } catch (error) {
    $("error").textContent = error.message;
  } finally {
    locked = false;
  }
}
async function control(state, mode = "hold", outfit) {
  try {
    const result = await call("pet_preview", {
      session_id: session,
      state,
      mode,
      outfit,
      duration_ms: 300000,
    });
    render(result.structuredContent);
  } catch (error) {
    $("error").textContent = error.message;
  }
}
$("language").onchange = (event) => {
  locale = event.target.value;
  localStorage.setItem("codex-pet-language", locale);
  localize();
};
$("outfit").onchange = (event) =>
  control(undefined, "auto", event.target.value);
$("auto").onclick = () => control(undefined, "auto");
$("size").oninput = (event) =>
  $("stage").style.setProperty("--pet-size", event.target.value + "px");
$("background").onclick = () => $("stage").classList.toggle("plain");
let pointerTimer;
function restore() {
  pointerIndex = undefined;
  clearTimeout(pointerTimer);
  if (latest) show(latest.state);
}
$("stage").addEventListener("pointermove", (event) => {
  if (!latest || latest.state !== "idle" || latest.mode !== "auto") return;
  const bounds = $("stage").getBoundingClientRect(),
    dx = event.clientX - bounds.left - bounds.width / 2,
    dy = event.clientY - bounds.top - bounds.height * 0.4;
  if (Math.hypot(dx, dy) < 45) {
    restore();
    return;
  }
  const angle = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360,
    index = Math.round(angle / 22.5) % 16;
  clearTimeout(pointerTimer);
  pointerTimer = setTimeout(() => {
    pointerIndex = index;
    show("looking", index);
  }, 160);
});
$("stage").addEventListener("pointerleave", restore);
localize();
try {
  if (!window.__CODEX_PET_PREVIEW_TOKEN__) {
    app = new App({ name: "Codex Desktop Pet", version: "0.2.0" }, {});
    app.ontoolresult = () => refresh();
    await app.connect();
  }
  initial = (await call("pet_open")).structuredContent;
  localize();
  render(initial);
  setInterval(refresh, 1400);
} catch (error) {
  $("caption").textContent = t("connectionError");
  $("error").textContent = error.message;
}
