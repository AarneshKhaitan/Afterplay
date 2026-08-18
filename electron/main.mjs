import { app, BrowserWindow, desktopCapturer, ipcMain, session, systemPreferences } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = process.env.AFTERPLAY_BASE_URL ?? "http://127.0.0.1:3100";
const companionUrl = new URL("/companion", baseUrl).toString();
const trustedOrigin = new URL(baseUrl).origin;
let selectedCaptureSourceId = null;

function isTrustedFrame(event) {
  try {
    return new URL(event.senderFrame.url).origin === trustedOrigin;
  } catch {
    return false;
  }
}

function assertTrustedFrame(event) {
  if (!isTrustedFrame(event)) throw new Error("Untrusted companion frame.");
}

async function captureSources() {
  const sources = await desktopCapturer.getSources({
    types: ["window", "screen"],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  });
  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
    appIcon: source.appIcon?.toDataURL() ?? null,
  }));
}

function registerDesktopBridge() {
  ipcMain.handle("riff:list-capture-sources", async (event) => {
    assertTrustedFrame(event);
    return captureSources();
  });
  ipcMain.handle("riff:select-capture-source", async (event, sourceId) => {
    assertTrustedFrame(event);
    const sources = await captureSources();
    const selected = sources.find((source) => source.id === sourceId);
    if (!selected) throw new Error("That game window is no longer available.");
    selectedCaptureSourceId = selected.id;
    return selected;
  });
  ipcMain.handle("riff:screen-permission", (event) => {
    assertTrustedFrame(event);
    return process.platform === "darwin"
      ? systemPreferences.getMediaAccessStatus("screen")
      : "granted";
  });

  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (new URL(request.securityOrigin).origin !== trustedOrigin || !selectedCaptureSourceId) {
      callback({});
      return;
    }
    const sources = await desktopCapturer.getSources({ types: ["window", "screen"] });
    const selected = sources.find((source) => source.id === selectedCaptureSourceId);
    callback(selected ? { video: selected } : {});
  });
}

function createCompanionWindow() {
  const window = new BrowserWindow({
    title: "Riff by Afterplay",
    width: 440,
    height: 760,
    minWidth: 390,
    minHeight: 620,
    show: false,
    backgroundColor: "#111316",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== trustedOrigin) event.preventDefault();
  });
  window.once("ready-to-show", () => window.show());
  void window.loadURL(companionUrl);
  return window;
}

app.whenReady().then(() => {
  registerDesktopBridge();
  createCompanionWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createCompanionWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
