// HERO 68 HE configuration protocol ("kb_by_v3_wired"), reverse-engineered from AULA hub.
// Transport-agnostic: works with WebHID (browser) and node-hid (CLI tools).
//
// Frame (63 bytes, HID report ID 9), indices WITHOUT the report id:
//   [0] cmd   (bit 0x80 = query; replies echo the cmd)
//   [1] sub   (setting id / layer)
//   [2] 0
//   [3] total packets (1)
//   [4] packet index (0)
//   [5] data length
//   [6..] data
//   [62] checksum = 255 - (9 + sum(bytes[0..61])) % 256

export const REPORT_ID = 9;
export const PAYLOAD = 63;
export const VID = 0x372e;
export const PID = 0x103e;

const CMD = {
  INFO: 0x82,        // read: device info (sub 1 uuid, 2 fw, 6 rt precision, 8 distance precision)
  KEYS_R: 0x83,      // read keymap
  KEYS_W: 0x03,      // write keymap
  SET_R: 0x84,       // read setting
  SET_W: 0x04,       // write setting
  PROFILE_R: 0x90,   // read active profile
  DIST_R: 0x93,      // read actuation distance
  DIST_W: 0x13,      // write actuation distance
  RT_R: 0x99,        // read rapid trigger
  RT_W: 0x19,        // write rapid trigger
  COLOR_R: 0x86,     // read per-key colors
  COLOR_W: 0x06,     // write per-key colors (multi-packet)
};
export const CUSTOM_LIGHT_MODE = 19;

// Setting sub-ids for SET_R/SET_W
export const SETTING = { LIGHT: 1, OS_MODE: 17, WIN_LOCK: 21, POLLING: 23 };

// Commands this module refuses to send (destructive / calibration). Belt and braces.
const FORBIDDEN = new Set([0x11 /*factory/layer reset*/, 0x16 /*safe area*/, 0x94 /*calibrate*/, 0x98 /*calibrate distance*/, 0x12 /*advanced keys*/, 0x05 /*macros*/]);

export const LIGHT_MODES = [
  [0, "Off"], [1, "Static"], [2, "Breathing"], [3, "Neon"], [4, "Reactive"], [5, "Ripple"],
  [6, "Wave"], [7, "Key ripple"], [8, "Spotlight"], [9, "Mode 9"], [10, "Mode 10"], [11, "Mode 11"],
  [12, "Mode 12"], [13, "Mode 13"], [14, "Mode 14"], [15, "Mode 15"], [16, "Mode 16"],
  [17, "Mode 17"], [18, "Mode 18"], [19, "Custom (per-key)"],
];
// Polling level -> rate, from AULA hub's kb_by_v3 settings page (levels are NOT in order).
export const POLLING = [[4, 8000], [5, 4000], [6, 2000], [0, 1000], [1, 500], [2, 250], [3, 125]];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };
const be16 = (v) => [(v >> 8) & 255, v & 255];

export function buildFrame(cmd, sub = 0, data = [], total = 1, index = 0) {
  if (FORBIDDEN.has(cmd)) throw new Error(`refusing to send forbidden command 0x${cmd.toString(16)}`);
  if (data.length > 56) throw new Error("data too long for one frame");
  const p = new Uint8Array(PAYLOAD);
  p[0] = cmd; p[1] = sub; p[3] = total; p[4] = index; p[5] = data.length;
  p.set(data, 6);
  let s = REPORT_ID;
  for (let i = 0; i < PAYLOAD - 1; i++) s += p[i];
  p[PAYLOAD - 1] = 255 - (s % 256);
  return p;
}

/**
 * transport: { send(Uint8Array63): Promise, onReport(cb(Uint8Array /* no report id *\/)) }
 */
export class Hero68 {
  constructor(transport, { log = () => {} } = {}) {
    this.t = transport;
    this.log = log;
    this.queue = [];
    this.waiters = [];
    this.busy = Promise.resolve();
    this.precision = 10;
    transport.onReport((r) => {
      for (let i = 0; i < this.waiters.length; i++) {
        const w = this.waiters[i];
        if (r[0] === w.cmd && r[3] === w.total && r[4] === w.index) { this.waiters.splice(i, 1); w.resolve(r); return; }
      }
    });
  }

  // serialize all requests
  _lock(fn) { const p = this.busy.then(fn, fn); this.busy = p.catch(() => {}); return p; }

  request(cmd, sub, data, { expect = cmd, timeout = 400, retries = 4, total = 1, index = 0 } = {}) {
    return this._lock(async () => {
      const frame = buildFrame(cmd, sub, data, total, index);
      for (let a = 0; a <= retries; a++) {
        const got = new Promise((resolve) => {
          const w = { cmd: expect, total, index, resolve };
          this.waiters.push(w);
          setTimeout(() => { const i = this.waiters.indexOf(w); if (i >= 0) { this.waiters.splice(i, 1); resolve(null); } }, timeout);
        });
        await this.t.send(frame);
        const r = await got;
        if (r) return r;
        await sleep(30);
      }
      throw new Error(`no reply to cmd 0x${cmd.toString(16)} sub ${sub}`);
    });
  }
  static data(r) { return Array.from(r.slice(6, 6 + Math.min(r[5] || 56, 56))); }
  static body(r) { return Array.from(r.slice(6, 62)); }

  // ---- info ----
  async uuid() { const d = Hero68.body(await this.request(CMD.INFO, 1, [0, 0, 0, 0, 0, 0])); return d.slice(0, 6).reduce((a, b) => a * 256 + b, 0); }
  async firmware() { const d = Hero68.body(await this.request(CMD.INFO, 2, [0])); return d[1] * 256 + d[0]; }
  async loadPrecision() {
    const rt = Hero68.body(await this.request(CMD.INFO, 6, []))[0];
    const dist = Hero68.body(await this.request(CMD.INFO, 8, []))[0];
    this.precision = dist || rt || 10;
    return { rt, dist: this.precision };
  }

  // ---- settings ----
  // AULA sends polling query with 1 data byte, the others with none
  async getSetting(id) { return Hero68.body(await this.request(CMD.SET_R, id, id === SETTING.POLLING ? [0] : [])); }
  async setSetting(id, bytes) { await this.request(CMD.SET_W, id, bytes, { expect: CMD.SET_W }); }

  async getLight() {
    const d = await this.getSetting(SETTING.LIGHT);
    return { mode: d[0], mix: d[1] === 7, r: d[2], g: d[3], b: d[4], bright: d[5], speed: d[6] };
  }
  async setLight({ mode, mix, r, g, b, bright, speed }) {
    await this.setSetting(SETTING.LIGHT, [mode, mix ? 7 : 0, r, g, b, bright, speed]);
  }
  async getOsMode() { return (await this.getSetting(SETTING.OS_MODE))[0] === 1 ? "mac" : "win"; }
  async setOsMode(m) { await this.setSetting(SETTING.OS_MODE, [m === "mac" ? 1 : 0]); }
  async getWinLock() { return (await this.getSetting(SETTING.WIN_LOCK))[0] === 1; }
  async setWinLock(v) { await this.setSetting(SETTING.WIN_LOCK, [v ? 1 : 0]); }
  async getPolling() { return (await this.getSetting(SETTING.POLLING))[0]; }
  // The keyboard re-enumerates on USB right after a polling change and never acks,
  // so this just sends the frame; the caller should expect a disconnect/reconnect.
  async setPolling(level) {
    if (!POLLING.some(([l]) => l === level)) throw new Error("invalid polling level " + level);
    await this._lock(() => this.t.send(buildFrame(CMD.SET_W, SETTING.POLLING, [level])));
  }
  async getProfile() { return Hero68.body(await this.request(CMD.PROFILE_R, 0, [0]))[0]; }

  // ---- keymap ----  value = 32-bit keycode
  async getKeys(layer, positions) {
    const out = {};
    for (const part of chunk(positions, 9)) {
      const r = await this.request(CMD.KEYS_R, layer, part.flatMap(be16));
      const d = Hero68.body(r);
      for (let i = 0; i < part.length; i++) {
        const pos = d[i * 6] * 256 + d[i * 6 + 1];
        if (pos !== part[i]) continue;
        out[pos] = ((d[i * 6 + 2] << 24) | (d[i * 6 + 3] << 16) | (d[i * 6 + 4] << 8) | d[i * 6 + 5]) >>> 0;
      }
    }
    return out;
  }
  async setKeys(layer, map /* {pos: value} */) {
    const entries = Object.entries(map).map(([p, v]) => [Number(p), Number(v) >>> 0]);
    for (const part of chunk(entries, 9)) {
      const data = part.flatMap(([p, v]) => [...be16(p), (v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
      await this.request(CMD.KEYS_W, layer, data, { expect: CMD.KEYS_W });
    }
  }

  // ---- actuation distance (mm) ----
  async getDistance(positions) {
    const out = {};
    for (const part of chunk(positions, 11)) {
      const d = Hero68.body(await this.request(CMD.DIST_R, 0, part.flatMap(be16)));
      for (let i = 0; i < part.length; i++) {
        const o = i * 5, pos = d[o] * 256 + d[o + 1];
        if (pos !== part[i]) continue;
        out[pos] = { mm: ((d[o + 2] * 256 + d[o + 3]) * this.precision) / 1000, global: d[o + 4] };
      }
    }
    return out;
  }
  async setDistance(map /* {pos: {mm, global}} */) {
    const entries = Object.entries(map);
    for (const part of chunk(entries, 11)) {
      const data = part.flatMap(([p, v]) => [...be16(Number(p)), ...be16(Math.round((v.mm * 1000) / this.precision)), v.global ?? 1]);
      await this.request(CMD.DIST_W, 0, data, { expect: CMD.DIST_W, timeout: 1000 });
    }
  }

  // ---- rapid trigger (mm) ----
  async getRT(positions) {
    const out = {};
    for (const part of chunk(positions, 6)) {
      const d = Hero68.body(await this.request(CMD.RT_R, 0, part.flatMap(be16)));
      for (let i = 0; i < part.length; i++) {
        const o = i * 8, pos = d[o] * 256 + d[o + 1];
        if (pos !== part[i]) continue;
        out[pos] = {
          on: d[o + 2] === 1,
          up: ((d[o + 3] * 256 + d[o + 4]) * this.precision) / 1000,
          down: ((d[o + 5] * 256 + d[o + 6]) * this.precision) / 1000,
          global: d[o + 7],
        };
      }
    }
    return out;
  }
  async setRT(map /* {pos: {on, up, down, global}} */) {
    const u = (mm) => be16(Math.round((mm * 1000) / this.precision));
    for (const part of chunk(Object.entries(map), 6)) {
      const data = part.flatMap(([p, v]) => [...be16(Number(p)), v.on ? 1 : 0, ...u(v.up), ...u(v.down), v.global ?? 1]);
      await this.request(CMD.RT_W, 0, data, { expect: CMD.RT_W, timeout: 1000 });
    }
  }

  // ---- per-key colors (used by light mode 19 "Custom") ----
  async getColors(positions) {
    const out = {};
    for (const part of chunk(positions, 11)) {
      const d = Hero68.body(await this.request(CMD.COLOR_R, 0, part.flatMap(be16)));
      for (let i = 0; i < part.length; i++) {
        const o = i * 5, pos = d[o] * 256 + d[o + 1];
        if (pos !== part[i]) continue;
        out[pos] = { r: d[o + 2], g: d[o + 3], b: d[o + 4] };
      }
    }
    return out;
  }
  async setColors(map /* {pos: {r,g,b}} */) {
    const parts = chunk(Object.entries(map), 11);
    for (let i = 0; i < parts.length; i++) {
      const data = parts[i].flatMap(([p, c]) => [...be16(Number(p)), c.r & 255, c.g & 255, c.b & 255]);
      await this.request(CMD.COLOR_W, 0, data, { expect: CMD.COLOR_W, total: parts.length, index: i, timeout: 1000 });
    }
  }

  // read with completeness check: retries missing positions, throws if still incomplete
  async _complete(fn, positions, what) {
    let out = await fn(positions);
    for (let i = 0; i < 3; i++) {
      const missing = positions.filter((p) => out[p] === undefined);
      if (!missing.length) return out;
      Object.assign(out, await fn(missing));
    }
    const missing = positions.filter((p) => out[p] === undefined);
    if (missing.length) throw new Error(`incomplete ${what} read (missing ${missing.length} keys)`);
    return out;
  }

  // ---- full snapshot (read-only) ----
  async snapshot(positions) {
    const s = { time: new Date().toISOString() };
    s.uuid = await this.uuid();
    s.firmware = await this.firmware();
    s.precision = await this.loadPrecision();
    s.profile = await this.getProfile();
    s.light = await this.getLight();
    s.os = await this.getOsMode();
    s.winLock = await this.getWinLock();
    s.polling = await this.getPolling();
    s.keys = {};
    for (const layer of [0, 1, 2]) s.keys[layer] = await this._complete((p) => this.getKeys(layer, p), positions, `layer ${layer} keymap`);
    s.distance = await this._complete((p) => this.getDistance(p), positions, "actuation");
    s.rt = await this._complete((p) => this.getRT(p), positions, "rapid trigger");
    s.colors = await this._complete((p) => this.getColors(p), positions, "key colors");
    return s;
  }
}
