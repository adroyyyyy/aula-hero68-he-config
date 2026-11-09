// Exposes a tiny, safe USB bridge to the UI.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hero68native", {
  connect: () => ipcRenderer.invoke("hid:connect"),
  status: () => ipcRenderer.invoke("hid:status"),
  send: (frame) => ipcRenderer.invoke("hid:send", Array.from(frame)),
  onReport: (cb) => ipcRenderer.on("hid:report", (_e, r) => cb(r)),
  onStatus: (cb) => ipcRenderer.on("hid:status", (_e, s) => cb(s)),
});
