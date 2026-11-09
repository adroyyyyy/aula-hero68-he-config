// USB HID worker (Electron utilityProcess). Owns the keyboard connection so the main
// process never holds native HID handles: node-hid's read thread can block process exit,
// so on quit the main process simply kills this worker.
const HID = require("node-hid");

const VID = 0x372e, PID = 0x103e, REPORT_ID = 9;
const port = process.parentPort;
let dev = null;
let status = { connected: false, error: null };

const post = (m) => port.postMessage(m);
function setStatus(s) { status = { ...status, ...s }; post({ type: "status", status }); }

function findInterface() {
  const all = HID.devices(VID, PID);
  return all.find((d) => d.usagePage === 0xff00) || all.find((d) => d.usagePage >= 0xff00) || null;
}
function dropDevice() { if (dev) { try { dev.removeAllListeners(); dev.close(); } catch {} dev = null; } }

function tryConnect() {
  if (dev) return;
  const info = findInterface();
  if (!info) return setStatus({ connected: false, error: null });
  try { dev = new HID.HID(info.path); }
  catch (e) { dev = null; return setStatus({ connected: false, error: "Couldn't open the keyboard: " + e.message + " (is the AULA website or another copy of this app open?)" }); }
  dev.on("data", (buf) => post({ type: "report", data: Array.from(buf[0] === REPORT_ID ? buf.subarray(1) : buf) }));
  dev.on("error", () => { dropDevice(); setStatus({ connected: false, error: null }); });
  setStatus({ connected: true, error: null });
}

setInterval(() => {
  if (dev && !findInterface()) { dropDevice(); setStatus({ connected: false }); }
  else if (!dev) tryConnect();
}, 1500);

port.on("message", ({ data: m }) => {
  if (m.type === "connect") { tryConnect(); post({ type: "status", status }); }
  else if (m.type === "send") {
    try {
      if (!dev) throw new Error("keyboard not connected");
      dev.write([REPORT_ID, ...m.frame]);
      post({ type: "sent", id: m.id, ok: true });
    } catch (e) { post({ type: "sent", id: m.id, ok: false, error: e.message }); }
  }
});

tryConnect();
