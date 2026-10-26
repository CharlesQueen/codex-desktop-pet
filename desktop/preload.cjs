// Author: CharlesQueen
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 CharlesQueen
// 本项目仅供非商业学习、交流与分享。对于他人违反许可证或侵犯第三方权利的使用行为及其后果，作者概不承担任何责任。
// This project is provided solely for noncommercial learning, discussion, and sharing. The author assumes no liability whatsoever for others’ use in violation of the license or third-party rights, or for any resulting consequences.

const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("codexPetDesktop", {
  snapshot: () => ipcRenderer.invoke("codex-pet-desktop:snapshot"),
  asset: (state, index, still, outfit) =>
    ipcRenderer.invoke("codex-pet-desktop:asset", {
      state,
      index,
      still,
      outfit,
    }),
  action: (state) => ipcRenderer.invoke("codex-pet-desktop:action", state),
  auto: () => ipcRenderer.invoke("codex-pet-desktop:auto"),
  resize: (delta) => ipcRenderer.invoke("codex-pet-desktop:resize", delta),
  menu: () => ipcRenderer.send("codex-pet-desktop:menu"),
  hide: () => ipcRenderer.send("codex-pet-desktop:hide"),
  mouseIgnore: (value) =>
    ipcRenderer.send("codex-pet-desktop:mouse-ignore", value),
  dragStart: (value) => ipcRenderer.send("codex-pet-desktop:drag-start", value),
  dragMove: (value) => ipcRenderer.send("codex-pet-desktop:drag-move", value),
  dragEnd: () => ipcRenderer.send("codex-pet-desktop:drag-end"),
  painted: (value) => ipcRenderer.send("codex-pet-desktop:painted", value),
  onStatus: (callback) => {
    const listener = (_, s) => callback(s);
    ipcRenderer.on("codex-pet-desktop:status", listener);
    return () =>
      ipcRenderer.removeListener("codex-pet-desktop:status", listener);
  },
  onCollapse: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("codex-pet-desktop:collapse", listener);
    return () =>
      ipcRenderer.removeListener("codex-pet-desktop:collapse", listener);
  },
});
