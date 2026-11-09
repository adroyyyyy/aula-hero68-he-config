// Electron main process. USB lives in a separate utility process (hid-worker.cjs):
// node-hid's read thread can stop a process from ever exiting, so on quit we kill the worker.
import { app, BrowserWindow, ipcMain, utilityProcess } from "electron";
import path from "node:path";
const here = import.meta.dirname;

let win = null;
let worker = null;
let quitting = false;
let status = { connected: false, error: null };
let nextId = 1;
const pending = new Map();

function startWorker() {
  worker = utilityProcess.fork(path.join(here, "hid-worker.cjs"), [], { serviceName: "HERO68 USB" });
  worker.on("message", (m) => {
    if (m.type === "status") { status = m.status; win?.webContents.send("hid:status", status); }
    else if (m.type === "report") win?.webContents.send("hid:report", m.data);
    else if (m.type === "sent") { const p = pending.get(m.id); pending.delete(m.id); m.ok ? p?.resolve(true) : p?.reject(new Error(m.error)); }
  });
  worker.on("exit", () => {
    worker = null;
    for (const p of pending.values()) p.reject(new Error("USB worker stopped"));
    pending.clear();
    if (!quitting) { status = { connected: false, error: null }; win?.webContents.send("hid:status", status); setTimeout(startWorker, 500); }
  });
}

ipcMain.handle("hid:connect", async () => { worker?.postMessage({ type: "connect" }); await new Promise((r) => setTimeout(r, 150)); return status; });
ipcMain.handle("hid:status", () => status);
ipcMain.handle("hid:send", (_e, frame) => new Promise((resolve, reject) => {
  if (!worker) return reject(new Error("keyboard not connected"));
  const id = nextId++;
  pending.set(id, { resolve, reject });
  worker.postMessage({ type: "send", id, frame });
}));

function createWindow() {
  win = new BrowserWindow({
    width: 1120,
    height: 860,
    minWidth: 820,
    minHeight: 600,
    title: "HERO 68 Config",
    backgroundColor: "#f4f4f1",
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(here, "..", "web", "index.html"));
  win.on("closed", () => (win = null));
  if (process.env.HERO68_SELFTEST) {
    // dev check: report what the UI shows, then quit
    win.webContents.on("console-message", (_e, _lvl, msg) => console.log("[renderer]", msg));
    setTimeout(async () => {
      if (process.env.HERO68_SELFTEST_POLL) {
        // dev check: click a polling rate in System tab, wait for the reconnect, report, then switch back
        const js = (s) => win.webContents.executeJavaScript(s);
        const clickBtn = (t) => js(`[...document.querySelectorAll("button")].find(b => b.textContent.trim() === ${JSON.stringify(t)})?.click(), true`);
        const info = () => js(`document.getElementById("info").textContent`);
        await clickBtn("System & Backup");
        await clickBtn("1K Hz"); await new Promise((r) => setTimeout(r, 6000));
        console.log("POLL after 1K:", await info());
        await clickBtn("4K Hz"); await new Promise((r) => setTimeout(r, 6000));
        console.log("POLL after 4K:", await info());
      }
      const r = await win.webContents.executeJavaScript(
        `({ info: document.getElementById("info").textContent, keys: document.querySelectorAll(".k").length,
            appVisible: !document.getElementById("app").classList.contains("hidden"),
            caps: [...document.querySelectorAll(".k")].find(k => k.title === "Caps")?.textContent,
            toast: document.getElementById("status").textContent })`);
      console.log("SELFTEST", JSON.stringify(r));
      app.quit();
    }, Number(process.env.HERO68_SELFTEST) || 6000);
  }
}

// Only one copy at a time (it owns the USB device). A second launch just shows the window.
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  app.on("second-instance", () => {
    if (!win) createWindow();
    else { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  });
  app.whenReady().then(() => {
    startWorker();
    createWindow();
    app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
}
// Kill the USB worker first so nothing native can block exit (this was leaving an invisible,
// stuck copy running after the window closed). The OS releases the keyboard when it dies.
app.on("before-quit", () => { quitting = true; worker?.kill(); });
app.on("window-all-closed", () => app.quit());
