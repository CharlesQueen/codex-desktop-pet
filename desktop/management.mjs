// Author: CharlesQueen
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// 本项目仅供非商业学习、交流与分享。对于他人违反许可证或侵犯第三方权利的使用行为及其后果，作者概不承担任何责任。
// This project is provided solely for noncommercial learning, discussion, and sharing. The author assumes no liability whatsoever for others’ use in violation of the license or third-party rights, or for any resulting consequences.
const info = await window.petManager.status(),
  zh = info.locale === "zh";
document.documentElement.lang = zh ? "zh-CN" : "en";
const text = zh
  ? {
      intro: "查看安装信息，打开客户端记录或卸载插件。",
      stateLabel: "安装状态",
      yes: "已安装",
      no: "未安装",
      versionLabel: "版本",
      sourceLabel: "来源",
      open: "在 Codex 中查看",
      uninstall: "卸载插件",
      note: "卸载保留本地设置和项目资源，不会删除其他插件。",
      cancel: "已取消",
      done: "已卸载，桌宠即将退出。",
    }
  : {
      intro:
        "View installation details, open the client record, or uninstall this plugin.",
      stateLabel: "Installation",
      yes: "Installed",
      no: "Not installed",
      versionLabel: "Version",
      sourceLabel: "Source",
      open: "View in Codex",
      uninstall: "Uninstall plugin",
      note: "Uninstall keeps settings and project assets and does not remove other plugins.",
      cancel: "Cancelled",
      done: "Uninstalled. The pet will close.",
    };
for (const [id, value] of Object.entries({
  intro: text.intro,
  "state-label": text.stateLabel,
  state: info.installed ? text.yes : text.no,
  "version-label": text.versionLabel,
  version: info.version || "—",
  "source-label": text.sourceLabel,
  source: info.marketplaceRoot || "—",
  open: text.open,
  uninstall: text.uninstall,
  note: text.note,
}))
  document.getElementById(id).textContent = value;
document.getElementById("uninstall").disabled = !info.installed;
document.getElementById("open").onclick = async () => {
  try {
    await window.petManager.open();
  } catch (error) {
    document.getElementById("result").textContent = error.message;
  }
};
document.getElementById("uninstall").onclick = async () => {
  const button = document.getElementById("uninstall");
  button.disabled = true;
  try {
    const result = await window.petManager.uninstall();
    document.getElementById("result").textContent = result.cancelled
      ? text.cancel
      : text.done;
    button.disabled = !result.cancelled;
  } catch (error) {
    document.getElementById("result").textContent = error.message;
    button.disabled = false;
  }
};
