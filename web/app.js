import { Hero68, VID, PID, REPORT_ID, LIGHT_MODES, CUSTOM_LIGHT_MODE, POLLING } from "./protocol.js";
import { KEYS, FACTORY, BOARD_W, BOARD_H } from "./layout.js";
import { groups, keyName as keyNameFor } from "./keycodes.js";

const EXPECTED_UUID = 18691697672195; // HERO 68 HE
const POS = KEYS.map((k) => k.pos);
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };

let kb = null, state = null, original = null;
const keyName = (v) => keyNameFor(v, state?.os);
let tab = "keymap", layer = 0;
const sel = new Set();

// ---------- status toast ----------
let toastT;
function toast(msg, err = false) {
  const s = $("status"); s.textContent = msg; s.className = "show" + (err ? " err" : "");
  clearTimeout(toastT); toastT = setTimeout(() => (s.className = ""), err ? 4000 : 1600);
}
async function act(label, fn) {
  try { toast(label + "…"); await fn(); toast(label + " ✓"); render(); }
  catch (e) { console.error(e); toast(label + " failed: " + e.message, true); }
}

// ---------- WebHID ----------
function webhidTransport(dev) {
  const handlers = [];
  dev.addEventListener("inputreport", (e) => {
    if (e.reportId !== REPORT_ID) return;
    const r = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength);
    handlers.forEach((h) => h(r));
  });
  return { send: (f) => dev.sendReport(REPORT_ID, f), onReport: (cb) => handlers.push(cb) };
}
const isVendor = (d) => d.vendorId === VID && d.productId === PID && d.collections.some((c) => c.usagePage >= 0xff00);

// ---------- native (desktop app) transport ----------
const native = window.hero68native;
let reportSink = null; // current Hero68 instance's handler
if (native) native.onReport((r) => reportSink?.(new Uint8Array(r)));
const nativeTransport = { send: (f) => native.send(f), onReport: (cb) => (reportSink = cb) };

let connecting = false;
async function connectNative() {
  if (connecting) return;
  connecting = true;
  try { await loadFrom(nativeTransport); }
  catch (e) { toast(e.message, true); $("info").textContent = "connected, but couldn't read settings — unplug and replug"; }
  finally { connecting = false; }
}
let expectReconnect = null; // set while a polling-rate change makes the keyboard re-enumerate
function showDisconnected(msg) {
  kb = null; state = null;
  if (expectReconnect) { $("info").textContent = expectReconnect.msg; return; } // keep UI up during the blip
  $("app").classList.add("hidden"); $("empty").classList.remove("hidden");
  $("info").textContent = msg || "waiting for keyboard…";
}

async function connect(dev) {
  if (!dev.opened) await dev.open();
  await loadFrom(webhidTransport(dev));
}
async function loadFrom(transport) {
  kb = new Hero68(transport);
  $("info").textContent = "reading settings…";
  const uuid = await kb.uuid();
  if (uuid !== EXPECTED_UUID) throw new Error("this doesn't look like a HERO 68 HE (uuid " + uuid + ")");
  state = await kb.snapshot(POS);
  original ??= JSON.parse(JSON.stringify(state)); // keep the undo baseline across reconnects
  updateInfo();
  $("empty").classList.add("hidden"); $("app").classList.remove("hidden");
  if (!native) $("connect").textContent = "Reconnect";
  if (expectReconnect) { const r = expectReconnect; expectReconnect = null; clearTimeout(r.timer); r.done(); }
  render();
}
function updateInfo() {
  const hz = POLLING.find(([l]) => l === state.polling)?.[1];
  $("info").textContent = `firmware v${(state.firmware >> 8)}.${(state.firmware & 255).toString(16).padStart(2, "0")} · ${state.os === "mac" ? "Mac" : "Windows"} mode · ${hz ? hz + " Hz" : "polling " + state.polling} · profile ${state.profile + 1}`;
}
async function pickAndConnect() {
  if (!navigator.hid) return toast("Open this page in Chrome or Edge (WebHID needed)", true);
  try {
    const devs = await navigator.hid.requestDevice({ filters: [{ vendorId: VID, productId: PID, usagePage: 0xff00 }] });
    const d = devs.find(isVendor); if (d) await connect(d);
  } catch (e) { toast(e.message, true); $("info").textContent = "not connected"; }
}
if (native) {
  // Desktop app: connection is automatic.
  $("connect").textContent = "Reload from keyboard";
  $("connect").onclick = () => native.connect().then((s) => (s.connected ? connectNative() : showDisconnected(s.error)));
  document.querySelector("#empty h2").textContent = "Plug in your HERO 68 HE";
  document.querySelector("#empty div").textContent = "It connects automatically. If it doesn't, close the AULA website and replug the cable.";
  native.onStatus((s) => (s.connected ? (!state && connectNative()) : showDisconnected(s.error)));
  native.connect().then((s) => (s.connected ? connectNative() : showDisconnected(s.error)));
} else {
  $("connect").onclick = pickAndConnect;
  if (navigator.hid) navigator.hid.getDevices().then((ds) => { const d = ds.find(isVendor); if (d) connect(d).catch((e) => toast(e.message, true)); });
}

// ---------- tabs ----------
const TABS = [["keymap", "Remap"], ["actuation", "Actuation"], ["rt", "Rapid Trigger"], ["light", "Lighting"], ["system", "System & Backup"]];
function renderTabs() {
  $("tabs").replaceChildren(...TABS.map(([id, name]) => el("button", { textContent: name, className: tab === id ? "on" : "", onclick: () => { tab = id; if (id === "keymap" && sel.size > 1) sel.clear(); render(); } })));
}

// ---------- keyboard ----------
function keyLabel(k) {
  if (tab === "keymap") {
    const v = state.keys[layer][k.pos];
    const name = keyName(v ?? 0);
    const factory = Number(FACTORY[0][k.pos]);
    // small label = what the physical key normally is, shown only on base layer when remapped
    return [name, layer === 0 && v !== factory ? keyName(factory) : null, v !== original.keys[layer][k.pos]];
  }
  if (tab === "actuation") { const d = state.distance[k.pos]; return [k.name, d ? d.mm.toFixed(2) + "mm" : "?", d && d.mm !== original.distance[k.pos].mm]; }
  if (tab === "rt") { const r = state.rt[k.pos]; return [k.name, r?.on ? `RT ${r.down.toFixed(2)}/${r.up.toFixed(2)}` : "off", JSON.stringify(r) !== JSON.stringify(original.rt[k.pos])]; }
  if (tab === "light") return [k.name, null, JSON.stringify(state.colors?.[k.pos]) !== JSON.stringify(original.colors?.[k.pos])];
  return [k.name, null, false];
}
const hexOf = (c) => "#" + [c.r, c.g, c.b].map((x) => x.toString(16).padStart(2, "0")).join("");
const rgbOf = (h) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });
function renderBoard() {
  const W = BOARD_W, H = BOARD_H, multi = tab === "actuation" || tab === "rt" || tab === "light", showSel = tab === "keymap" || multi;
  $("board").replaceChildren(...KEYS.map((k) => {
    const [main, sub, changed] = keyLabel(k);
    const d = el("div", { className: "k" + (showSel && sel.has(k.pos) ? " sel" : "") + (changed ? " changed" : ""), title: k.name });
    Object.assign(d.style, { left: (k.x / W) * 100 + "%", top: (k.y / H) * 100 + "%", width: (k.w / W) * 100 + "%", height: (k.h / H) * 100 + "%" });
    if (tab === "light" && state.colors?.[k.pos]) {
      const c = shownColor(k.pos, state.colors[k.pos]), lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
      d.classList.add("lit");
      d.style.setProperty("--lit", hexOf(c));
      d.style.color = lum > 140 ? "#1d1d1b" : "#f4f4f1";
    }
    d.append(el("span", { textContent: main }));
    if (sub) d.append(el("small", { textContent: sub }));
    d.dataset.pos = k.pos;
    if (tab === "light" && brush) {
      d.classList.add("brush");
      d.addEventListener("pointerdown", (e) => { e.preventDefault(); brushDown(k.pos); });
      d.addEventListener("pointerenter", () => brushOver(k.pos));
      return d;
    }
    d.onclick = () => {
      if (!showSel) return;
      if (multi) sel.has(k.pos) ? sel.delete(k.pos) : sel.add(k.pos);
      else { sel.clear(); sel.add(k.pos); }
      render();
    };
    return d;
  }));
  $("selrow").classList.toggle("hidden", !multi || (tab === "light" && brush));
  $("layers").classList.toggle("hidden", tab !== "keymap");
  $("layers").replaceChildren(el("label", { textContent: "Layer" }), ...[["Base", 0], ["Fn1", 1], ["Fn2", 2]].map(([n, l]) =>
    el("button", { textContent: n, className: layer === l ? "on" : "", onclick: () => { layer = l; render(); } })));
  $("hint").textContent = {
    keymap: "Click a key, then pick what it should do. Changes save to the keyboard instantly. Orange dot = changed since you connected.",
    actuation: "Select one or more keys (or Select all), set the actuation point, then Apply.",
    rt: "Rapid Trigger: the key resets as soon as it moves up by the release distance, and re-fires when it moves down by the press distance.",
    light: brush ? "Brush: click a key (or drag across keys) to paint it with the color chosen below." : "Select keys (click, or use Quick select below), then press Paint.",
    system: "",
  }[tab];
  $("board").parentElement.classList.toggle("hidden", tab === "system");
}
$("selAll").onclick = () => { POS.forEach((p) => sel.add(p)); render(); };
$("selNone").onclick = () => { sel.clear(); render(); };

// ---------- panels ----------
function slider(label, min, max, step, value, onInput) {
  const num = el("input", { type: "number", min, max, step, value });
  const rng = el("input", { type: "range", min, max, step, value });
  rng.oninput = () => { num.value = rng.value; onInput?.(+rng.value); };
  num.oninput = () => { rng.value = num.value; onInput?.(+num.value); };
  const row = el("div", { className: "row" }, el("label", { textContent: label }), rng, num);
  row.get = () => +num.value;
  return row;
}

function panelKeymap() {
  const [pos] = [...sel];
  if (pos === undefined) return [el("div", { className: "hint", textContent: "Select a key above." })];
  const k = KEYS.find((x) => x.pos === pos);
  const cur = state.keys[layer][pos];
  const out = [el("div", { className: "row" }, el("strong", { textContent: `${keyName(Number(FACTORY[0][k.pos]))} key on ${["Base", "Fn1", "Fn2"][layer]} layer → ${keyName(cur)}` }),
    el("button", { textContent: "Undo to original", disabled: cur === original.keys[layer][pos], onclick: () => setKey(pos, original.keys[layer][pos]) }))];
  const picker = el("div", { className: "picker" });
  for (const g of groups(state.os)) {
    picker.append(el("h4", { textContent: g.name }), el("div", { className: "grid" }, ...g.keys.map(([n, v]) =>
      el("button", { textContent: n, className: (v >>> 0) === cur ? "on" : "", onclick: () => setKey(pos, v >>> 0) }))));
  }
  out.push(picker);
  return out;
}
function setKey(pos, v) {
  if (layer === 0 && (v >>> 24) === 0x0d && !confirm("Putting an Fn key on the base layer can lock you out of the Fn layer if you lose the original Fn key. Continue?")) return;
  if (layer === 0 && pos === 72 && (v >>> 24) !== 0x0d && !confirm("This is your only Fn key. Without it you can't reach the Fn layer (media keys, lighting controls). Continue?")) return;
  act("Saving key", async () => { await kb.setKeys(layer, { [pos]: v }); state.keys[layer][pos] = (await kb.getKeys(layer, [pos]))[pos]; });
}

function panelActuation() {
  const first = state.distance[[...sel][0]];
  const s = slider("Actuation (mm)", 0.05, 3.3, 0.01, first ? first.mm : 1.2);
  const presets = el("div", { className: "row" }, el("label", { textContent: "Presets" }),
    ...[["Gaming 0.4", 0.4], ["Fast 0.8", 0.8], ["Normal 1.5", 1.5], ["Typing 2.0", 2.0], ["Heavy 2.8", 2.8]].map(([n, v]) =>
      el("button", { textContent: n, onclick: () => { s.querySelector("input[type=range]").value = v; s.querySelector("input[type=number]").value = v; } })));
  const apply = el("button", { className: "primary", textContent: `Apply to ${sel.size} key${sel.size === 1 ? "" : "s"}`, disabled: !sel.size,
    onclick: () => act("Saving actuation", async () => {
      const mm = Math.min(3.3, Math.max(0.05, s.get()));
      // global byte: 0 = key follows the global setting, 1 = use this per-key value
      const map = Object.fromEntries([...sel].map((p) => [p, { mm, global: 1 }]));
      await kb.setDistance(map);
      Object.assign(state.distance, await kb.getDistance([...sel]));
    }) });
  return [s, presets, el("div", { className: "row" }, apply)];
}

function panelRT() {
  const first = state.rt[[...sel][0]] || { on: true, up: 0.2, down: 0.2 };
  let on = true; // panel defaults to enabling RT; click the toggle to turn it off
  const tog = el("button", { textContent: "", onclick: () => { on = !on; paint(); } });
  const paint = () => { tog.textContent = on ? "Rapid Trigger: ON" : "Rapid Trigger: OFF"; tog.className = on ? "on" : ""; };
  paint();
  const down = slider("Press sensitivity (mm)", 0.01, 2.0, 0.01, first.down || 0.2);
  const up = slider("Release sensitivity (mm)", 0.01, 2.0, 0.01, first.up || 0.2);
  const apply = el("button", { className: "primary", textContent: `Apply to ${sel.size} key${sel.size === 1 ? "" : "s"}`, disabled: !sel.size,
    onclick: () => act("Saving rapid trigger", async () => {
      const map = Object.fromEntries([...sel].map((p) => [p, { on, up: up.get(), down: down.get(), global: 1 }]));
      await kb.setRT(map);
      Object.assign(state.rt, await kb.getRT([...sel]));
    }) });
  return [el("div", { className: "row" }, el("label", { textContent: "Mode" }), tog), down, up, el("div", { className: "row" }, apply)];
}

// ---------- white balance ----------
// This board's LEDs run green/blue-heavy; RGB 247,141,142 is what looks like true white on it.
// Picked colors are scaled by this before being sent, and un-scaled for display.
const WHITE_POINT = { r: 247, g: 141, b: 142 };
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
let correct = store.get("colorCorrection") !== "off";
const toDevice = (c) => correct ? { r: Math.round((c.r * WHITE_POINT.r) / 255), g: Math.round((c.g * WHITE_POINT.g) / 255), b: Math.round((c.b * WHITE_POINT.b) / 255) } : { ...c };
// exact colors the user picked, so display doesn't drift from rounding: pos -> {dev: "r,g,b", hex}
const picked = (() => { try { return JSON.parse(store.get("pickedColors") || "{}"); } catch { return {}; } })();
const rememberPick = (positions, dev, hex) => { for (const p of positions) picked[p] = { dev: `${dev.r},${dev.g},${dev.b}`, hex }; store.set("pickedColors", JSON.stringify(picked)); };
const shownColor = (pos, c) => { const m = picked[pos]; return m && m.dev === `${c.r},${c.g},${c.b}` ? rgbOf(m.hex) : fromDevice(c); };
const fromDevice = (c) => correct ? { r: Math.min(255, Math.round((c.r * 255) / WHITE_POINT.r)), g: Math.min(255, Math.round((c.g * 255) / WHITE_POINT.g)), b: Math.min(255, Math.round((c.b * 255) / WHITE_POINT.b)) } : { ...c };

let lightT;
function panelLight() {
  const L = state.light;
  const push = () => { clearTimeout(lightT); lightT = setTimeout(() => act("Saving lighting", async () => { await kb.setLight(L); state.light = await kb.getLight(); }), 150); };
  const mode = el("select", { onchange: () => { L.mode = +mode.value; push(); } },
    ...LIGHT_MODES.map(([v, n]) => el("option", { value: v, textContent: n, selected: v === L.mode })));
  const color = el("input", { type: "color", value: hexOf(fromDevice(L)), oninput: () => { Object.assign(L, toDevice(rgbOf(color.value))); push(); } });
  const rainbow = el("input", { type: "checkbox", checked: L.mix, onchange: () => { L.mix = rainbow.checked; push(); } });
  const cc = el("input", { type: "checkbox", checked: correct, onchange: () => { correct = cc.checked; store.set("colorCorrection", correct ? "on" : "off"); render(); } });
  return [
    el("div", { className: "row" }, el("label", { textContent: "Effect" }), mode),
    el("div", { className: "row" }, el("label", { textContent: "Color" }), color, el("label", { style: "min-width:auto" }, rainbow, " rainbow")),
    el("div", { className: "row" }, el("label", { textContent: "Color correction" }),
      el("label", { style: "min-width:auto", title: `Scales colors so white is sent as ${WHITE_POINT.r},${WHITE_POINT.g},${WHITE_POINT.b}, which looks neutral on this keyboard's LEDs` }, cc, " true white (balance the LEDs)")),
    slider("Brightness", 0, 20, 1, L.bright, (v) => { L.bright = v; push(); }),
    slider("Speed", 0, 4, 1, L.speed, (v) => { L.speed = v; push(); }),
    ...panelPaint(),
  ];
}

// ---------- per-key color painting ----------
const QUICK = {
  WASD: ["W", "A", "S", "D"],
  Arrows: ["Up", "Down", "Left", "Right"],
  Letters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
  Numbers: "1234567890".split(""),
  Modifiers: ["L_Shift", "R_Shift", "L_Ctrl", "R_Ctrl", "L_Alt", "R_Alt", "L_WIN", "Fn1", "Caps", "Tab"],
  Nav: ["Insert", "Delete", "PgUp", "PgDn", "Esc", "Backspace", "Enter", "Space"],
};
const SWATCHES = ["#ffffff", "#ff2d2d", "#ff8a00", "#ffd400", "#2bd96b", "#00d1ff", "#2f6bff", "#9b4dff", "#ff4fb8", "#000000"];
let paintColor = "#ff2d2d";
let brush = true; // Lighting tab: click/drag on keys paints immediately

async function paintKeys(positions, hex) {
  const c = toDevice(rgbOf(hex));
  for (const p of positions) state.colors[p] = { ...c }; // instant feedback
  rememberPick(positions, c, hex);
  render();
  await act(positions.length === 1 ? "Painting key" : `Painting ${positions.length} keys`, async () => {
    await kb.setColors(Object.fromEntries(positions.map((p) => [p, c])));
    Object.assign(state.colors, await kb.getColors(positions));
    if (state.light.mode !== CUSTOM_LIGHT_MODE) { state.light.mode = CUSTOM_LIGHT_MODE; await kb.setLight(state.light); state.light = await kb.getLight(); }
  });
}

// drag-to-paint on the board
let dragging = null; // Set of positions touched during a drag
function brushDown(pos) { dragging = new Set([pos]); markBrushed(pos); }
function brushOver(pos) { if (dragging && !dragging.has(pos)) { dragging.add(pos); markBrushed(pos); } }
function markBrushed(pos) { const k = [...document.querySelectorAll(".k")].find((e) => Number(e.dataset.pos) === pos); if (k) { k.classList.add("lit"); k.style.setProperty("--lit", paintColor); } }
window.addEventListener("pointerup", () => { if (!dragging) return; const ps = [...dragging]; dragging = null; paintKeys(ps, paintColor); });

function panelPaint() {
  if (!state.colors) return [];
  const byName = (names) => KEYS.filter((k) => names.includes(k.name)).map((k) => k.pos);
  const tool = el("div", { className: "row" }, el("label", { textContent: "Tool" }),
    el("button", { textContent: "🖌 Brush: click or drag keys to paint", className: brush ? "on" : "", onclick: () => { brush = true; sel.clear(); render(); } }),
    el("button", { textContent: "Select, then paint", className: brush ? "" : "on", onclick: () => { brush = false; render(); } }));
  const quick = el("div", { className: "row" }, el("label", { textContent: "Quick select" }),
    ...Object.entries(QUICK).map(([n, names]) => el("button", { textContent: n, onclick: () => { byName(names).forEach((p) => sel.add(p)); render(); } })),
    el("button", { textContent: "Same color as selected", title: "Select every key that has the same color as the first selected key",
      disabled: !sel.size, onclick: () => { const c = JSON.stringify(state.colors[[...sel][0]]); POS.filter((p) => JSON.stringify(state.colors[p]) === c).forEach((p) => sel.add(p)); render(); } }));
  const picker = el("input", { type: "color", value: paintColor, oninput: () => (paintColor = picker.value) });
  const swatches = SWATCHES.map((h) => {
    const b = el("button", { title: h, className: "swatch" + (h === paintColor ? " on" : ""), onclick: () => { paintColor = h; picker.value = h; render(); } });
    b.style.background = h;
    return b;
  });
  return [
    el("hr", { style: "border:none;border-top:1px solid var(--line);margin:18px 0" }),
    el("h3", { textContent: "Per-key colors", style: "margin:0 0 4px;font-size:15px" }),
    el("div", { className: "hint", textContent: "Example: pick white → Fill whole keyboard. Then pick red and click (or drag across) the keys you want red. Painting switches the effect to Custom." }),
    tool,
    el("div", { className: "row" }, el("label", { textContent: "Color" }), picker, ...swatches),
    ...(brush ? [] : [quick]),
    el("div", { className: "row" },
      ...(brush ? [] : [el("button", { className: "primary", textContent: `Paint ${sel.size} selected key${sel.size === 1 ? "" : "s"}`, disabled: !sel.size, onclick: () => paintKeys([...sel], paintColor) })]),
      el("button", { textContent: "Fill whole keyboard with this color", onclick: () => paintKeys(POS, paintColor) }),
      el("button", { textContent: "Undo colors", disabled: JSON.stringify(state.colors) === JSON.stringify(original.colors),
        onclick: () => act("Restoring colors", async () => { await kb.setColors(original.colors); state.colors = await kb.getColors(POS); }) })),
  ];
}

function panelSystem() {
  const os = el("div", { className: "row" }, el("label", { textContent: "OS mode" }),
    ...[["Mac", "mac"], ["Windows", "win"]].map(([n, v]) => el("button", { textContent: n, className: state.os === v ? "on" : "",
      onclick: () => act("Switching OS mode", async () => { await kb.setOsMode(v); state.os = await kb.getOsMode(); updateInfo(); }) })));
  const wl = el("div", { className: "row" }, el("label", { textContent: "Win key lock" }),
    el("button", { textContent: state.winLock ? "Locked" : "Unlocked", className: state.winLock ? "on" : "",
      onclick: () => act("Saving Win lock", async () => { await kb.setWinLock(!state.winLock); state.winLock = await kb.getWinLock(); }) }));
  const save = el("button", { textContent: "Download backup", onclick: () => {
    const a = el("a", { href: URL.createObjectURL(new Blob([JSON.stringify(state, null, 1)], { type: "application/json" })), download: `hero68-backup-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json` });
    a.click();
  } });
  const file = el("input", { type: "file", accept: ".json", className: "hidden", onchange: () => restore(file.files[0]) });
  const load = el("button", { textContent: "Restore from backup…", onclick: () => file.click() });
  const undoAll = el("button", { textContent: "Undo everything since connecting", onclick: () => restoreSnap(original, "Undoing all changes") });
  return [os, wl,
    el("div", { className: "row" }, el("label", { textContent: "Polling rate" }),
      ...POLLING.map(([lvl, hz]) => el("button", { textContent: hz >= 1000 ? hz / 1000 + "K Hz" : hz + " Hz", className: state.polling === lvl ? "on" : "",
        onclick: () => setPollingRate(lvl, hz) }))),
    el("div", { className: "hint", textContent: "Higher = lower input lag, slightly more CPU. The keyboard disconnects for ~2 seconds while it switches; that's normal." }),
    el("hr", { style: "border:none;border-top:1px solid var(--line);margin:18px 0" }),
    el("div", { className: "row" }, el("label", { textContent: "Backup" }), save, load, file, undoAll)];
}
async function restore(f) {
  if (!f) return;
  try {
    const snap = JSON.parse(await f.text());
    if (snap.uuid !== EXPECTED_UUID || !snap.keys) throw new Error("not a HERO 68 HE backup");
    if (!confirm("Overwrite keymaps, actuation, rapid trigger, lighting and OS mode with this backup?")) return;
    restoreSnap(snap, "Restoring backup");
  } catch (e) { toast(e.message, true); }
}
function setPollingRate(level, hz) {
  if (level === state.polling) return;
  toast(`Switching to ${hz} Hz — keyboard will reconnect…`);
  expectReconnect = {
    msg: `switching to ${hz} Hz, reconnecting…`,
    done: () => toast(state.polling === level ? `Polling rate: ${hz} Hz ✓` : `Polling rate didn't change (still level ${state.polling})`, state.polling !== level),
    timer: setTimeout(() => { if (expectReconnect) { expectReconnect = null; if (!state) showDisconnected("keyboard didn't come back — replug it"); } }, 10000),
  };
  kb.setPolling(level).catch(() => {}); // no ack expected; the keyboard drops off USB and returns
}
function restoreSnap(snap, label) {
  act(label, async () => {
    for (const l of [0, 1, 2]) await kb.setKeys(l, snap.keys[l]);
    await kb.setDistance(snap.distance);
    await kb.setRT(snap.rt);
    if (snap.colors) await kb.setColors(snap.colors);
    await kb.setLight(snap.light);
    await kb.setOsMode(snap.os);
    await kb.setWinLock(snap.winLock);
    state = await kb.snapshot(POS);
    if (snap.polling !== undefined && snap.polling !== state.polling) {
      const hz = POLLING.find(([l]) => l === snap.polling)?.[1];
      if (hz) setPollingRate(snap.polling, hz); // last, because it makes the keyboard reconnect
    }
  });
}

function render() {
  if (!state) return;
  renderTabs(); renderBoard();
  const p = { keymap: panelKeymap, actuation: panelActuation, rt: panelRT, light: panelLight, system: panelSystem }[tab]();
  $("panel").replaceChildren(...p);
}
