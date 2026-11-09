// UI smoke test: runs web/app.js in jsdom against a simulated keyboard seeded from a backup.
// usage: node tools/ui-smoke.mjs <backup.json>   (needs jsdom: npm i -D jsdom)
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const WEB = path.join(import.meta.dirname, "..", "web");
const snap = JSON.parse(fs.readFileSync(process.argv[2]));
const html = fs.readFileSync(path.join(WEB, "index.html"), "utf8").replace(/<script type="module"[^>]*><\/script>/, "");
const dom = new JSDOM(html, { url: "http://localhost:8068/", pretendToBeVisual: true });
const w = dom.window;
for (const k of ["document", "HTMLElement", "Event"]) globalThis[k] = w[k];
globalThis.window = w;
globalThis.confirm = () => true;
w.confirm = () => true;

const mem = JSON.parse(JSON.stringify(snap));
if (!mem.colors) { mem.colors = {}; for (const p of Object.keys(mem.distance)) mem.colors[p] = { r: 0, g: 0, b: 0 }; }
const startColors = JSON.parse(JSON.stringify(mem.colors));
const u = (mm) => { const v = Math.round(mm * 100); return [v >> 8, v & 255]; };
function reply(f) {
  const r = new Uint8Array(63);
  r[0] = f[0]; r[1] = f[1]; r[3] = f[3]; r[4] = f[4];
  const d = [...f.slice(6, 6 + f[5])];
  const put = (a) => r.set(a.slice(0, 56), 6);
  const pos = (i) => d[i * 2] * 256 + d[i * 2 + 1];
  const n = f[5] / 2;
  const o = [];
  switch (f[0]) {
    case 0x82: put(f[1] === 1 ? [0x11, 0, 0, 0, 0, 3] : f[1] === 2 ? [0x18, 3] : [10]); break;
    case 0x90: put([mem.profile]); break;
    case 0x84: {
      const L = mem.light;
      put(f[1] === 1 ? [L.mode, L.mix ? 7 : 0, L.r, L.g, L.b, L.bright, L.speed] : f[1] === 17 ? [mem.os === "mac" ? 1 : 0] : f[1] === 21 ? [mem.winLock ? 1 : 0] : [mem.polling]);
      break;
    }
    case 0x83:
      for (let i = 0; i < n; i++) { const p = pos(i), v = mem.keys[f[1]][p]; o.push(p >> 8, p & 255, (v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); }
      put(o); break;
    case 0x93:
      for (let i = 0; i < n; i++) { const p = pos(i), x = mem.distance[p]; o.push(p >> 8, p & 255, ...u(x.mm), x.global); }
      put(o); break;
    case 0x99:
      for (let i = 0; i < n; i++) { const p = pos(i), x = mem.rt[p]; o.push(p >> 8, p & 255, x.on ? 1 : 0, ...u(x.up), ...u(x.down), x.global); }
      put(o); break;
    case 0x04: {
      if (f[1] === 23) { // polling: real keyboard re-enumerates and never acks
        mem.polling = d[0];
        setTimeout(() => statusCbs.forEach((cb) => cb({ connected: false })), 50);
        setTimeout(() => statusCbs.forEach((cb) => cb({ connected: true })), 400);
        return null;
      }
      if (f[1] === 1) { const L = mem.light; [L.mode, , L.r, L.g, L.b, L.bright, L.speed] = d; L.mix = d[1] === 7; }
      if (f[1] === 17) mem.os = d[0] ? "mac" : "win";
      if (f[1] === 21) mem.winLock = !!d[0];
      break;
    }
    case 0x03: for (let i = 0; i < d.length; i += 6) mem.keys[f[1]][d[i] * 256 + d[i + 1]] = ((d[i + 2] << 24) | (d[i + 3] << 16) | (d[i + 4] << 8) | d[i + 5]) >>> 0; break;
    case 0x13: for (let i = 0; i < d.length; i += 5) mem.distance[d[i] * 256 + d[i + 1]] = { mm: (d[i + 2] * 256 + d[i + 3]) / 100, global: d[i + 4] }; break;
    case 0x19: for (let i = 0; i < d.length; i += 8) mem.rt[d[i] * 256 + d[i + 1]] = { on: d[i + 2] === 1, up: (d[i + 3] * 256 + d[i + 4]) / 100, down: (d[i + 5] * 256 + d[i + 6]) / 100, global: d[i + 7] }; break;
    case 0x86:
      for (let i = 0; i < n; i++) { const p = pos(i), c = mem.colors[p]; o.push(p >> 8, p & 255, c.r, c.g, c.b); }
      put(o); break;
    case 0x06: for (let i = 0; i < d.length; i += 5) mem.colors[d[i] * 256 + d[i + 1]] = { r: d[i + 2], g: d[i + 3], b: d[i + 4] }; break;
    default: throw new Error("unexpected cmd " + f[0]);
  }
  return r;
}
// simulate the desktop app's preload bridge (window.hero68native)
const statusCbs = [], reportCbs = [];
w.hero68native = {
  connect: async () => ({ connected: true }),
  status: async () => ({ connected: true }),
  onStatus: (cb) => statusCbs.push(cb),
  onReport: (cb) => reportCbs.push(cb),
  async send(f) {
    f = Uint8Array.from(f);
    const s = [...f].slice(0, 62).reduce((a, b) => a + b, 9);
    if (f[62] !== 255 - (s % 256)) throw new Error("bad checksum");
    const r = reply(f);
    if (r) setTimeout(() => reportCbs.forEach((cb) => cb(Array.from(r))), 2);
  },
};
Object.defineProperty(globalThis, "navigator", { value: w.navigator, configurable: true });

const errors = [];
process.on("unhandledRejection", (e) => errors.push(String(e)));
await import(pathToFileURL(path.join(WEB, "app.js")).href);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => w.document.querySelector(s);
const $$ = (s) => [...w.document.querySelectorAll(s)];
const click = (e) => { if (!e) throw new Error("element not found"); e.dispatchEvent(new w.Event("click", { bubbles: true })); };
const btn = (t) => $$("button").find((b) => b.textContent.trim().startsWith(t));
const key = (name) => $$(".k").find((k) => k.title === name);
let ok = true;
const check = (name, c) => { console.log(c ? "PASS" : "FAIL", name); ok &&= !!c; };

await sleep(700);
check("connected + info shown", /firmware v3\.18/.test($("#info").textContent));
check("68 keys rendered", $$(".k").length === 68);

check("Mac bottom row: Control Option Command Space Command", ["L_Ctrl", "L_WIN", "L_Alt", "Space", "R_Alt"].map((n) => key(n).textContent).join("|") === "L Control|L Option|L Command|Space|R Command");
click(key("Caps")); await sleep(50); click(btn("L Control")); await sleep(300);
check("remap Caps -> Control", mem.keys[0][42] === 0x00010000 && key("Caps").textContent === "L ControlCaps");

click(btn("Actuation")); await sleep(30); click(btn("Select all")); await sleep(30); click(btn("Gaming 0.4")); click(btn("Apply to")); await sleep(800);
check("actuation 0.4mm on all 68", Object.values(mem.distance).filter((x) => x.mm === 0.4).length === 68);

click(btn("Rapid Trigger")); await sleep(30); click(btn("Clear selection")); await sleep(30); click(key("W")); await sleep(30); click(btn("Apply to")); await sleep(400);
check("rapid trigger on W", mem.rt[30].on && !mem.rt[29].on);

click(btn("Lighting")); await sleep(30);
const s = $("select"); s.value = "2"; s.dispatchEvent(new w.Event("change")); await sleep(500);
check("lighting -> breathing", mem.light.mode === 2);

// user's flow: fill white, then brush red across W A S D (one drag)
const swatch = (h) => $$("button.swatch").find((b) => b.title === h);
const ptr = (e, type) => e.dispatchEvent(new w.Event(type, { bubbles: type !== "pointerenter" }));
click(swatch("#ffffff")); await sleep(30);
click(btn("Fill whole keyboard")); await sleep(1200);
check("fill white", Object.values(mem.colors).every((c) => c.r === 247 && c.g === 141 && c.b === 142));
click(swatch("#ff2d2d")); await sleep(30);
ptr(key("W"), "pointerdown"); ptr(key("A"), "pointerenter"); ptr(key("S"), "pointerenter"); ptr(key("D"), "pointerenter");
w.dispatchEvent(new w.Event("pointerup")); await sleep(600);
const isRed = (c) => c.r === 247 && c.g === 25 && c.b === 25; // #ff2d2d white-balanced
check("brush-drag paints W A S D red", [30, 43, 44, 45].every((p) => isRed(mem.colors[p])));
check("...and the other 64 keys stay white", Object.entries(mem.colors).filter(([p]) => ![30, 43, 44, 45].includes(+p)).every(([, c]) => c.r === 247 && c.g === 141));
ptr(key("Q"), "pointerdown"); w.dispatchEvent(new w.Event("pointerup")); await sleep(400);
check("single brush click paints Q", isRed(mem.colors[29]));

// select-then-paint mode still works
click(btn("Select, then paint")); await sleep(30);
click(btn("Clear selection")); await sleep(30); click(btn("WASD")); await sleep(30);
click(swatch("#2bd96b")); await sleep(30);
click(btn("Paint 4 selected")); await sleep(600);
// green #2bd96b = (43,217,107) is sent white-balanced: (43*247/255, 217*141/255, 107*142/255) = (42,120,60)
const G = { r: 42, g: 120, b: 60 };
const isG = (c) => c.r === G.r && c.g === G.g && c.b === G.b;
check("paint WASD green (white-balanced)", [30, 43, 44, 45].every((p) => isG(mem.colors[p])) && !isG(mem.colors[29]));
check("painting switches to Custom effect", mem.light.mode === 19);
check("painted keys shown as picked color on board", key("W").classList.contains("lit") && key("W").style.getPropertyValue("--lit") === "#2bd96b");
click($$("button.swatch").find((b) => b.title === "#ffffff")); await sleep(30);
click(btn("Fill whole keyboard")); await sleep(1200);
check("white fills as 247,141,142 on all 68 (7 packets)", Object.values(mem.colors).every((c) => c.r === 247 && c.g === 141 && c.b === 142));

click(btn("System")); await sleep(30);
check("polling shows current 4K Hz", btn("4K Hz")?.className === "on" && /4000 Hz/.test($("#info").textContent));
click(btn("1K Hz")); await sleep(80);
check("UI stays up during polling reconnect", !$("#app").classList.contains("hidden"));
await sleep(1500);
check("polling switched to 1000 Hz after reconnect", mem.polling === 0 && btn("1K Hz")?.className === "on" && /1000 Hz/.test($("#info").textContent));
click(btn("Undo everything")); await sleep(2500);
check("undo restores polling rate", mem.polling === snap.polling);
check("undo restores keymap", mem.keys[0][42] === snap.keys[0][42]);
check("undo restores actuation", JSON.stringify(mem.distance) === JSON.stringify(snap.distance));
check("undo restores RT", JSON.stringify(mem.rt) === JSON.stringify(snap.rt));
check("undo restores lighting", JSON.stringify(mem.light) === JSON.stringify(snap.light));
check("undo restores key colors", JSON.stringify(mem.colors) === JSON.stringify(startColors));
check("no runtime errors", errors.length === 0 || (console.log(errors), false));
console.log(ok ? "ALL PASS" : "SOME FAILED");
process.exit(ok ? 0 : 1);
