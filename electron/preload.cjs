// Electron's sandboxed preload is CommonJS even though the main process is ESM.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("afterplayDesktop", {
  isDesktop: true,
  platform: process.platform,
  listCaptureSources: () => ipcRenderer.invoke("riff:list-capture-sources"),
  selectCaptureSource: (sourceId) => ipcRenderer.invoke("riff:select-capture-source", sourceId),
  getScreenPermission: () => ipcRenderer.invoke("riff:screen-permission"),
});
