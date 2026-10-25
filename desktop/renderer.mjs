// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 CharlesQueen
// 本项目仅供非商业学习、交流与分享。对于他人违反许可证或侵犯第三方权利的使用行为及其后果，作者概不承担任何责任。
// This project is provided solely for noncommercial learning, discussion, and sharing. The author assumes no liability whatsoever for others’ use in violation of the license or third-party rights, or for any resulting consequences.

import { translate } from "../i18n.mjs";
const api = window.codexPetDesktop,
  pet = document.getElementById("pet"),
  controls = document.getElementById("controls"),
  caption = document.getElementById("caption");
let latest,
  dragging = false,
  dragX = 0,
  dragState,
  pointerIndex,
  desired = "",
  serial = 0,
  suppressUntil = 0;
const cache = new Map(),
  pending = new Map();
const mask = document.createElement("canvas");
mask.width = 128;
mask.height = 100;
const context = mask.getContext("2d", { willReadFrequently: true });
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
async function decoded(state, index) {
  const key =
    latest.outfit + ":" + state + ":" + (index ?? "animation") + ":" + reduced;
  if (cache.has(key)) return cache.get(key);
  if (pending.has(key)) return pending.get(key);
  const promise = (async () => {
    const url = await api.asset(state, index, reduced, latest.outfit);
    const im = new Image();
    im.src = url;
    await im.decode();
    cache.set(key, im);
    if (cache.size > 5) cache.delete(cache.keys().next().value);
    return im;
  })();
  pending.set(key, promise);
  try {
    return await promise;
  } finally {
    pending.delete(key);
  }
}
async function show(state, index) {
  const key = latest.outfit + ":" + state + ":" + (index ?? "animation");
  if (key === desired) return;
  desired = key;
  const ticket = ++serial;
  try {
    const im = await decoded(state, index);
    if (ticket !== serial) return;
    pet.src = im.src;
    await pet.decode();
    if (ticket !== serial) return;
    document.body.classList.remove("has-error");
    api.painted({
      state,
      index: index ?? null,
      naturalWidth: im.naturalWidth,
      naturalHeight: im.naturalHeight,
    });
  } catch (e) {
    if (ticket === serial) {
      desired = "";
      document.body.classList.add("has-error");
      document.getElementById("notice").textContent = translate(
        latest.locale,
        "loadError",
      );
    }
  }
}
function render(s) {
  latest = s;
  const t = (key) => translate(s.locale, key);
  document.documentElement.lang = s.locale;
  pet.alt = t("name");
  caption.textContent = t(s.state);
  caption.title = s.hook_seen
    ? t("working")
    : s.source === "model"
      ? t("model")
      : s.source === "preview"
        ? t("preview")
        : t("unconnected");
  for (const [id, key] of [
    ["smaller", "smaller"],
    ["larger", "larger"],
    ["menu", "menu"],
    ["hide", "hide"],
  ])
    document.getElementById(id).title = t(key);
  if (s.state !== "idle" || s.mode !== "auto") pointerIndex = undefined;
  show(
    dragState || (pointerIndex === undefined ? s.state : "looking"),
    dragState ? undefined : pointerIndex,
  );
}
function hit(x, y) {
  if (!pet.naturalWidth) return true;
  const box = pet.getBoundingClientRect(),
    scale = Math.min(
      box.width / pet.naturalWidth,
      box.height / pet.naturalHeight,
    ),
    w = pet.naturalWidth * scale,
    h = pet.naturalHeight * scale,
    l = box.left + (box.width - w) / 2,
    t = box.top + (box.height - h) / 2;
  if (x < l || x >= l + w || y < t || y >= t + h) return false;
  context.clearRect(0, 0, 128, 100);
  context.drawImage(pet, 0, 0, 128, 100);
  return (
    context.getImageData(
      Math.min(127, Math.floor(((x - l) / w) * 128)),
      Math.min(99, Math.floor(((y - t) / h) * 100)),
      1,
      1,
    ).data[3] > 14
  );
}
function isControl(target) {
  return (
    controls.contains(target) &&
    document.body.classList.contains("show-controls")
  );
}
let lastMove = 0,
  lookTimer;
document.addEventListener("pointermove", (e) => {
  if (dragging) {
    api.dragMove({ x: e.screenX, y: e.screenY });
    const diff = e.screenX - dragX;
    if (Math.abs(diff) > 3) {
      dragState = diff > 0 ? "running-right" : "running-left";
      render(latest);
    }
    return;
  }
  const solid = hit(e.clientX, e.clientY),
    control = isControl(e.target);
  api.mouseIgnore(!solid && !control);
  if (Date.now() > suppressUntil)
    document.body.classList.toggle("show-controls", solid || control);
  if (!latest || latest.state !== "idle" || latest.mode !== "auto" || !solid)
    return;
  if (Date.now() - lastMove < 90) return;
  lastMove = Date.now();
  const b = pet.getBoundingClientRect(),
    dx = e.clientX - b.width / 2,
    dy = e.clientY - b.height * 0.35;
  if (Math.hypot(dx, dy) < 35) {
    pointerIndex = undefined;
    render(latest);
    return;
  }
  const angle = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  clearTimeout(lookTimer);
  lookTimer = setTimeout(() => {
    pointerIndex = Math.round(angle / 22.5) % 16;
    render(latest);
  }, 130);
});
document.addEventListener("pointerleave", () => {
  if (!dragging) {
    document.body.classList.remove("show-controls");
    pointerIndex = undefined;
    clearTimeout(lookTimer);
    if (latest) render(latest);
    api.mouseIgnore(false);
  }
});
document.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || isControl(e.target) || !hit(e.clientX, e.clientY))
    return;
  e.preventDefault();
  dragging = true;
  dragX = e.screenX;
  document.body.classList.add("dragging");
  document.body.setPointerCapture(e.pointerId);
  api.mouseIgnore(false);
  api.dragStart({ x: e.screenX, y: e.screenY });
});
function endDrag() {
  if (!dragging) return;
  dragging = false;
  dragState = undefined;
  document.body.classList.remove("dragging");
  api.dragEnd();
  if (latest) render(latest);
}
document.addEventListener("pointerup", endDrag);
document.addEventListener("pointercancel", endDrag);
window.addEventListener("blur", endDrag);
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  api.mouseIgnore(false);
  api.menu();
});
function collapse() {
  suppressUntil = Date.now() + 1500;
  document.body.classList.remove("show-controls");
  pointerIndex = undefined;
  clearTimeout(lookTimer);
  if (latest) render(latest);
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    collapse();
  }
});
api.onCollapse(collapse);
document.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      api.resize(e.deltaY < 0 ? 30 : -30);
    }
  },
  { passive: false },
);
document.getElementById("smaller").onclick = () => api.resize(-30);
document.getElementById("larger").onclick = () => api.resize(30);
document.getElementById("menu").onclick = () => api.menu();
document.getElementById("hide").onclick = () => api.hide();
api.onStatus(render);
render(await api.snapshot());
