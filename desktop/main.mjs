// Author: CharlesQueen
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 CharlesQueen
// 本项目仅供非商业学习、交流与分享。对于他人违反许可证或侵犯第三方权利的使用行为及其后果，作者概不承担任何责任。
// This project is provided solely for noncommercial learning, discussion, and sharing. The author assumes no liability whatsoever for others’ use in violation of the license or third-party rights, or for any resulting consequences.

import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  screen,
  shell,
  dialog,
} from "electron";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ROOT,
  DATA,
  STATES,
  LABELS,
  status,
  setState,
  manifest,
  assetPath,
} from "../core.mjs";
import {
  sizeForHeight,
  clampBounds,
  point,
  visibleArea,
} from "./window-model.mjs";
import { activeDesktopHosts } from "../desktop-lifecycle.mjs";
import { readVisibility, writeVisibility } from "../desktop-visibility.mjs";
import { translate, language, outfitLabel } from "../i18n.mjs";
import { nearbyPointer } from "./pointer-model.mjs";
let managed = process.argv.includes("--managed"),
  hostTimer,
  emptySince,
  exitReason;
const STARTED_AT = Date.now();
const HERE = path.dirname(fileURLToPath(import.meta.url)),
  testMode = process.argv.includes("--self-test");
const takeArg = (name) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
const userData =
  process.env.CODEX_PET_DESKTOP_USER_DATA ||
  path.join(ROOT, ".local", "desktop");
fs.mkdirSync(userData, { recursive: true });
app.setPath("userData", userData);
app.setName("Codex Desktop Pet");
let settings = {
  height: 360,
  alwaysOnTop: true,
  session_id: takeArg("--session") || null,
};
const settingsPath = path.join(userData, "settings.json");
if (fs.existsSync(settingsPath))
  settings = {
    ...settings,
    ...JSON.parse(fs.readFileSync(settingsPath, "utf8")),
  };
if (takeArg("--session")) settings.session_id = takeArg("--session");
let hasBeenRevealed = false;
let managementWindow;
const executeFile = promisify(execFile),
  installationFile = path.join(DATA, "installation.json");
function installationInfo() {
  const info = fs.existsSync(installationFile)
    ? JSON.parse(fs.readFileSync(installationFile, "utf8"))
    : {
        name: "Codex Desktop Pet",
        version: JSON.parse(
          fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
        ).version,
        installed: false,
      };
  return {
    ...info,
    locale: settings.locale,
    installed:
      !!info.installed &&
      fs.existsSync(path.join(info.installedPath, ".codex-plugin/plugin.json")),
  };
}
function managePlugin() {
  if (managementWindow) {
    managementWindow.show();
    managementWindow.focus();
    return;
  }
  managementWindow = new BrowserWindow({
    width: 740,
    height: 560,
    title: translate(settings.locale, "management"),
    parent: win,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(HERE, "management-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  managementWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  managementWindow.webContents.on("will-navigate", (event) =>
    event.preventDefault(),
  );
  managementWindow.on("closed", () => (managementWindow = undefined));
  managementWindow.once("ready-to-show", () => {
    managementWindow.show();
    writeReport();
  });
  managementWindow.loadFile(path.join(HERE, "management.html"));
}
ipcMain.handle("codex-pet-management:status", () => installationInfo());
ipcMain.handle("codex-pet-management:open", () =>
  shell.openExternal(
    "codex://plugins/codex-desktop-pet?marketplacePath=" +
      encodeURIComponent(path.join(ROOT, ".agents/plugins/marketplace.json")),
  ),
);
ipcMain.handle("codex-pet-management:uninstall", async (event) => {
  if (event.sender !== managementWindow?.webContents)
    throw new Error("Unknown management window");
  const zh = settings.locale === "zh";
  const choice = await dialog.showMessageBox(managementWindow, {
    type: "question",
    buttons: zh ? ["取消", "卸载插件"] : ["Cancel", "Uninstall plugin"],
    defaultId: 0,
    cancelId: 0,
    message: zh ? "卸载 Codex Desktop Pet？" : "Uninstall Codex Desktop Pet?",
    detail: zh
      ? "会停止桌宠并移除插件注册，保留本地设置及项目资源。"
      : "Stops the pet and removes its plugin registration. Settings and project assets are retained.",
  });
  if (choice.response !== 1) return { cancelled: true };
  const { stdout } = await executeFile(
    "node",
    [
      path.join(ROOT, "scripts/manage-plugin.mjs"),
      "uninstall",
      "--from-desktop",
    ],
    { windowsHide: true, env: process.env },
  );
  setTimeout(() => quit("plugin-uninstalled"), 800);
  return JSON.parse(stdout);
});
let win,
  tray,
  quitting = false,
  pollTimer,
  pointerTimer,
  drag,
  ignore = false,
  lastPayload = "",
  painted,
  reportTimer;
const reportPath = path.join(userData, "window-status.json");
const ratio = manifest().canvas[0] / manifest().canvas[1];
function saveSettings() {
  if (win && !win.isDestroyed()) settings.bounds = win.getBounds();
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}
function current() {
  return status(settings.session_id || undefined);
}
function payload() {
  return {
    ...current(),
    alwaysOnTop: settings.alwaysOnTop,
    locale: settings.locale,
    outfits: manifest().outfits,
  };
}
function broadcast() {
  if (!win || win.isDestroyed()) return;
  const s = payload(),
    key = JSON.stringify(s);
  if (key !== lastPayload) {
    lastPayload = key;
    win.webContents.send("codex-pet-desktop:status", s);
    writeReport();
  }
}
function writeReport() {
  if (!win || win.isDestroyed()) return;
  clearTimeout(reportTimer);
  reportTimer = setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    const bounds = win.getBounds();
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          startedAt: STARTED_AT,
          updatedAt: Date.now(),
          pid: process.pid,
          visible: win.isVisible(),
          visibilityMode: readVisibility(ROOT),
          destroyed: win.isDestroyed(),
          alwaysOnTop: win.isAlwaysOnTop(),
          transparent: true,
          managementVisible:
            !!managementWindow &&
            !managementWindow.isDestroyed() &&
            managementWindow.isVisible(),
          managed,
          hostCount: activeDesktopHosts().length,
          nativeHandle: win.getNativeWindowHandle().toString("hex"),
          bounds,
          visibleArea: screen
            .getAllDisplays()
            .reduce((n, d) => n + visibleArea(bounds, d.workArea), 0),
          nativeAssetSize: manifest().canvas,
          painted: painted || null,
          status: current(),
          dataDirectory: DATA,
        },
        null,
        2,
      ),
    );
  }, 80);
}
let pinTimer,
  pinRevision = 0;
// Windows can reset topmost while showing a window. / Windows 显示窗口时可能重置置顶状态。
function applyPin() {
  clearTimeout(pinTimer);
  const revision = ++pinRevision;
  function apply(attempt) {
    if (quitting || win.isDestroyed() || revision !== pinRevision) return;
    win.setAlwaysOnTop(settings.alwaysOnTop, "floating");
    if (attempt < 8)
      pinTimer = setTimeout(() => {
        if (
          !quitting &&
          !win.isDestroyed() &&
          revision === pinRevision &&
          win.isAlwaysOnTop() !== settings.alwaysOnTop
        )
          apply(attempt + 1);
      }, 150);
  }
  apply(0);
}
function hide() {
  writeVisibility(ROOT, "hidden");
  hasBeenRevealed = true;
  win.hide();
  writeReport();
}
function reveal(explicit = true) {
  if (explicit) writeVisibility(ROOT, "shown");
  else if (readVisibility(ROOT) !== "shown") return;
  hasBeenRevealed = true;
  win.setIgnoreMouseEvents(false);
  ignore = false;
  win.showInactive();
  applyPin();
  writeReport();
}
function resizeHeight(height) {
  const area = screen.getDisplayMatching(win.getBounds()).workArea,
    size = sizeForHeight(height, ratio, area),
    old = win.getBounds();
  settings.height = size.height;
  win.setBounds(
    clampBounds(
      {
        ...size,
        x: old.x + old.width - size.width,
        y: old.y + old.height - size.height,
      },
      area,
    ),
  );
  saveSettings();
  writeReport();
}
function setPin(value) {
  settings.alwaysOnTop = !!value;
  applyPin();
  saveSettings();
  broadcast();
}
function perform(state) {
  setState(
    {
      session_id: current().session_id,
      state,
      mode: "hold",
      duration_ms: 300000,
    },
    "preview",
  );
  broadcast();
}
function automatic() {
  setState({ session_id: current().session_id, mode: "auto" }, "preview");
  broadcast();
}
function quit(reason = "user") {
  if (reason === "user") writeVisibility(ROOT, "exited");
  exitReason = reason;
  quitting = true;
  app.quit();
}
function watchHosts() {
  if (hostTimer) return;
  hostTimer = setInterval(() => {
    if (fs.existsSync(installationFile)) {
      const info = JSON.parse(fs.readFileSync(installationFile, "utf8"));
      if (
        !info.installed ||
        !fs.existsSync(
          path.join(info.installedPath, ".codex-plugin/plugin.json"),
        )
      ) {
        quit("plugin-uninstalled");
        return;
      }
    }
    if (!managed) return;
    const hosts = activeDesktopHosts();
    if (hosts.length) {
      emptySince = undefined;
    } else {
      emptySince ??= Date.now();
      if (Date.now() - emptySince > 3000) quit("all-plugin-hosts-disconnected");
    }
  }, 1000);
  hostTimer.unref();
}
function menu() {
  const t = (key) => translate(settings.locale, key);
  Menu.buildFromTemplate([
    {
      label: win.isVisible() ? t("hide") : t("show"),
      click: () => (win.isVisible() ? hide() : reveal()),
    },
    {
      label: t("pin"),
      type: "checkbox",
      checked: win.isAlwaysOnTop(),
      click: (item) => setPin(item.checked),
    },
    {
      label: t("size"),
      submenu: [240, 300, 360, 450, 540, 660].map((height) => ({
        label:
          height === 360
            ? t("standard")
            : height < 360
              ? t("small") + " " + height
              : t("large") + " " + height,
        type: "radio",
        checked: Math.abs(settings.height - height) < 5,
        click: () => resizeHeight(height),
      })),
    },
    {
      label: t("language"),
      submenu: [
        ["en", "English"],
        ["zh", "中文"],
      ].map(([locale, label]) => ({
        label,
        type: "radio",
        checked: settings.locale === locale,
        click: () => {
          settings.locale = locale;
          saveSettings();
          broadcast();
        },
      })),
    },
    { type: "separator" },
    { label: t("auto"), click: automatic },
    {
      label: t("latest"),
      click: () => {
        settings.session_id = null;
        saveSettings();
        broadcast();
      },
    },
    {
      label: t("preview"),
      submenu: STATES.map((state) => ({
        label: t(state),
        click: () => perform(state),
      })),
    },
    {
      label: t("outfit"),
      submenu: manifest().outfits.map((outfit) => ({
        label: outfitLabel(outfit, settings.locale),
        type: "radio",
        checked: current().outfit === outfit.id,
        click: () => {
          setState(
            {
              session_id: current().session_id,
              outfit: outfit.id,
              mode: "auto",
            },
            "preview",
          );
          broadcast();
        },
      })),
    },
    { type: "separator" },
    { label: t("management"), click: managePlugin },
    { label: t("exit"), click: () => quit() },
  ]).popup({ window: win });
}
function fromWindow(event) {
  return win && !win.isDestroyed() && event.sender === win.webContents;
}
function asset(state, index, still, outfit) {
  return pathToFileURL(assetPath({ state, frame_index: index, still, outfit }))
    .href;
}
function registerIpc() {
  ipcMain.handle("codex-pet-desktop:snapshot", (event) => {
    if (fromWindow(event)) return payload();
  });
  ipcMain.handle("codex-pet-desktop:asset", (event, args) => {
    if (fromWindow(event))
      return asset(args.state, args.index, !!args.still, args.outfit);
  });
  ipcMain.handle("codex-pet-desktop:action", (event, state) => {
    if (fromWindow(event)) {
      perform(state);
      return payload();
    }
  });
  ipcMain.handle("codex-pet-desktop:auto", (event) => {
    if (fromWindow(event)) {
      automatic();
      return payload();
    }
  });
  ipcMain.handle("codex-pet-desktop:resize", (event, delta) => {
    if (fromWindow(event) && typeof delta === "number" && Math.abs(delta) <= 60)
      resizeHeight(settings.height + delta);
  });
  for (const [channel, action] of [
    ["menu", menu],
    ["hide", hide],
  ])
    ipcMain.on("codex-pet-desktop:" + channel, (event) => {
      if (fromWindow(event)) action();
    });
  ipcMain.on("codex-pet-desktop:mouse-ignore", (event, value) => {
    if (
      fromWindow(event) &&
      typeof value === "boolean" &&
      !drag &&
      ignore !== value
    ) {
      ignore = value;
      win.setIgnoreMouseEvents(value, { forward: true });
    }
  });
  ipcMain.on("codex-pet-desktop:drag-start", (event, p) => {
    if (fromWindow(event) && point(p))
      drag = { point: p, bounds: win.getBounds() };
  });
  ipcMain.on("codex-pet-desktop:drag-move", (event, p) => {
    if (!fromWindow(event) || !drag || !point(p)) return;
    const area = screen.getDisplayNearestPoint(p).workArea;
    win.setBounds(
      clampBounds(
        {
          ...drag.bounds,
          x: drag.bounds.x + p.x - drag.point.x,
          y: drag.bounds.y + p.y - drag.point.y,
        },
        area,
      ),
    );
  });
  ipcMain.on("codex-pet-desktop:drag-end", (event) => {
    if (fromWindow(event)) {
      drag = undefined;
      saveSettings();
      writeReport();
    }
  });
  ipcMain.on("codex-pet-desktop:painted", (event, p) => {
    if (fromWindow(event) && STATES.includes(p.state)) {
      painted = p;
      if (!testMode && !hasBeenRevealed) reveal(false);
      writeReport();
    }
  });
}
function createWindow() {
  const area = (
      settings.bounds &&
      Number.isFinite(settings.bounds.x) &&
      Number.isFinite(settings.bounds.y)
        ? screen.getDisplayMatching(settings.bounds)
        : screen.getPrimaryDisplay()
    ).workArea,
    size = sizeForHeight(settings.height, ratio, area),
    initial = settings.bounds
      ? clampBounds({ ...settings.bounds, ...size }, area)
      : {
          ...size,
          x: area.x + area.width - size.width - 22,
          y: area.y + area.height - size.height - 22,
        };
  win = new BrowserWindow({
    ...initial,
    title: "Codex Desktop Pet",
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: settings.alwaysOnTop,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    webPreferences: {
      preload: path.join(HERE, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.session.setPermissionRequestHandler((_w, _p, callback) =>
    callback(false),
  );
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  win.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      hide();
    }
  });
  win.on("moved", () => {
    if (!drag) saveSettings();
    writeReport();
  });
  win.on("show", () => {
    applyPin();
    writeReport();
  });
  win.on("always-on-top-changed", writeReport);
  win.on("hide", writeReport);
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "Escape") {
      event.preventDefault();
      win.webContents.send("codex-pet-desktop:collapse");
    }
  });
  registerIpc();
  win.loadFile(path.join(HERE, "index.html"));
  pollTimer = setInterval(broadcast, 400);
  let wasNearby = false;
  pointerTimer = setInterval(() => {
    if (win.webContents.isLoading()) return;
    const p =
      !drag && win.isVisible()
        ? nearbyPointer(screen.getCursorScreenPoint(), win.getBounds())
        : null;
    if (p || wasNearby) win.webContents.send("codex-pet-desktop:pointer", p);
    wasNearby = !!p;
  }, 100);
  const icon = nativeImage
    .createFromPath(assetPath({ state: "idle", still: true }))
    .resize({ width: 24, height: 24 });
  tray = new Tray(icon);
  tray.setToolTip("Codex Desktop Pet");
  tray.on("click", () => reveal());
  tray.on("right-click", menu);
}
// Recheck in the desktop process as older hosts can still send automatic launches.
// 桌面进程再次检查，兼容仍会发起自动启动的旧连接。
const suppressedLaunch = managed && readVisibility(ROOT) === "exited";
const ownsInstance = !suppressedLaunch && app.requestSingleInstanceLock();
if (!ownsInstance) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    if (argv.includes("--exit")) {
      quit();
      return;
    }
    if (argv.includes("--hide")) {
      hide();
      return;
    }
    if (argv.includes("--quit")) {
      quit("uninstall");
      return;
    }
    if (argv.includes("--manage")) {
      managePlugin();
      return;
    }
    if (argv.includes("--managed")) {
      managed = true;
      emptySince = undefined;
      writeReport();
    }
    const index = argv.indexOf("--session");
    if (index >= 0 && argv[index + 1]) {
      settings.session_id = argv[index + 1];
      saveSettings();
      broadcast();
    }
    if (!argv.includes("--managed")) reveal();
  });
  app.whenReady().then(() => {
    if (process.argv.includes("--quit")) {
      quit("uninstall");
      return;
    }
    if (process.argv.includes("--exit")) {
      quit();
      return;
    }
    if (process.argv.includes("--hide")) writeVisibility(ROOT, "hidden");
    else if (!managed && !process.argv.includes("--manage"))
      writeVisibility(ROOT, "shown");
    if (activeDesktopHosts().length) managed = true;
    settings.locale ??= language(app.getLocale());
    createWindow();
    watchHosts();
    if (process.argv.includes("--manage")) managePlugin();
    if (testMode)
      import("../tests/native-window.mjs")
        .then(({ runNativeWindowTest }) =>
          runNativeWindowTest({
            current,
            win,
            settings,
            resizeHeight,
            broadcast,
            setPin,
            perform,
            automatic,
            reveal,
            userData,
            screen,
            quit,
            getPainted: () => painted,
            isIgnoringMouse: () => ignore,
          }),
        )
        .catch((error) => {
          console.error(error);
          fs.writeFileSync(
            path.join(userData, "self-test-failure.json"),
            JSON.stringify(
              {
                message: error.message,
                visible: win?.isVisible(),
                alwaysOnTop: win?.isAlwaysOnTop(),
                bounds: win?.getBounds(),
                settings,
                nativeHandle: win?.getNativeWindowHandle().toString("hex"),
                pid: process.pid,
              },
              null,
              2,
            ),
          );
          quitting = true;
          app.exit(1);
        });
  });
}
app.on("before-quit", () => {
  // A short-lived second instance must not mark the shared window as exited.
  // 短暂的第二实例不能把仍在运行的共享窗口标记为已退出。
  if (!ownsInstance) return;
  if (fs.existsSync(reportPath)) {
    const last = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          ...last,
          exiting: true,
          exitReason: exitReason || "application-exit",
          visibilityMode: readVisibility(ROOT),
          closedAt: Date.now(),
        },
        null,
        2,
      ),
    );
  }
  quitting = true;
  clearTimeout(pinTimer);
  clearInterval(hostTimer);
  clearInterval(pollTimer);
  clearInterval(pointerTimer);
  clearTimeout(reportTimer);
  tray?.destroy();
});
app.on("window-all-closed", () => {});
