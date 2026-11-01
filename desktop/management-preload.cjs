// Author: CharlesQueen
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
const { contextBridge, ipcRenderer } = require("electron");
// 本项目仅供非商业学习、交流与分享。对于他人违反许可证或侵犯第三方权利的使用行为及其后果，作者概不承担任何责任。
// This project is provided solely for noncommercial learning, discussion, and sharing. The author assumes no liability whatsoever for others’ use in violation of the license or third-party rights, or for any resulting consequences.
contextBridge.exposeInMainWorld("petManager", {
  status: () => ipcRenderer.invoke("codex-pet-management:status"),
  open: () => ipcRenderer.invoke("codex-pet-management:open"),
  uninstall: () => ipcRenderer.invoke("codex-pet-management:uninstall"),
});
