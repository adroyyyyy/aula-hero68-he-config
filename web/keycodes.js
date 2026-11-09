// Keycode catalogue for the HERO 68 HE (32-bit values, see README for format).
const hid = (n) => n >>> 0;
const mod = (bit) => (bit << 16) >>> 0;

export const GROUPS = [
  { name: "Letters", keys: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c, i) => [c, hid(0x04 + i)]) },
  { name: "Numbers", keys: "1234567890".split("").map((c, i) => [c, hid(0x1e + i)]) },
  {
    name: "Basics",
    keys: [
      ["Esc", 0x29], ["Tab", 0x2b], ["Caps", 0x39], ["Space", 0x2c], ["Enter", 0x28], ["Backspace", 0x2a],
      ["`~", 0x35], ["-_", 0x2d], ["=+", 0x2e], ["[{", 0x2f], ["]}", 0x30], ["\\|", 0x31], [";:", 0x33],
      ["'\"", 0x34], [",<", 0x36], [".>", 0x37], ["/?", 0x38],
    ],
  },
  { name: "Modifiers", keys: [] }, // filled per OS by groups()
  {
    name: "Navigation",
    keys: [
      ["Up", 0x52], ["Down", 0x51], ["Left", 0x50], ["Right", 0x4f], ["Home", 0x4a], ["End", 0x4d],
      ["PgUp", 0x4b], ["PgDn", 0x4e], ["Insert", 0x49], ["Delete", 0x4c], ["PrtSc", 0x46], ["ScrLk", 0x47], ["Pause", 0x48],
    ],
  },
  { name: "Function", keys: Array.from({ length: 12 }, (_, i) => ["F" + (i + 1), 0x3a + i]).concat(Array.from({ length: 12 }, (_, i) => ["F" + (i + 13), 0x68 + i])) },
  {
    name: "Media",
    keys: [
      ["Play/Pause", 0x020000cd], ["Next", 0x020000b5], ["Prev", 0x020000b6], ["Stop", 0x020000b7],
      ["Vol +", 0x020000e9], ["Vol −", 0x020000ea], ["Mute", 0x020000e2],
      ["Bright +", 0x0200006f], ["Bright −", 0x02000070], ["Calculator", 0x02000192], ["Browser", 0x02000223], ["Mail", 0x0200018a],
    ],
  },
  { name: "Layers", keys: [["Fn1", 0x0d000000], ["Fn2", 0x0d010000]] },
  { name: "Other", keys: [["None", 0x00000000]] },
];

// Modifier bits (byte 2). In Mac mode the firmware swaps Alt<->GUI, so the key next to the
// space bar (Alt code) acts as Command and the Win-position key (GUI code) acts as Option.
const MOD_NAMES = {
  win: ["L Ctrl", "L Shift", "L Alt", "L Win", "R Ctrl", "R Shift", "R Alt", "R Win"],
  mac: ["L Control", "L Shift", "L Command", "L Option", "R Control", "R Shift", "R Command", "R Option"],
};
const MOD_SHORT = {
  win: ["Ctrl", "Shift", "Alt", "Win", "RCtrl", "RShift", "RAlt", "RWin"],
  mac: ["⌃", "⇧", "⌘", "⌥", "R⌃", "R⇧", "R⌘", "R⌥"],
};
const MOD_ORDER = { win: [0, 1, 2, 3, 4, 5, 6, 7], mac: [0, 1, 3, 2, 4, 5, 7, 6] }; // mac: Control, Shift, Option, Command

export function groups(os = "win") {
  os = os === "mac" ? "mac" : "win";
  return GROUPS.map((g) => g.name !== "Modifiers" ? g : { ...g, keys: MOD_ORDER[os].map((i) => [MOD_NAMES[os][i], mod(1 << i)]) });
}

const NAMES = new Map();
for (const g of GROUPS) for (const [n, v] of g.keys) if (!NAMES.has(v >>> 0)) NAMES.set(v >>> 0, n);

export function keyName(v, os = "win") {
  os = os === "mac" ? "mac" : "win";
  v = v >>> 0;
  const MODS = MOD_SHORT[os];
  if ((v & 0xff00ffff) === 0) { const m = (v >>> 16) & 255; const i = Math.log2(m); if (Number.isInteger(i)) return MOD_NAMES[os][i]; }
  if (NAMES.has(v)) return NAMES.get(v);
  const type = v >>> 24;
  if (type === 0x07) return { 0x0e: "Win mode", 0x0f: "Mac mode" }[v & 255] || "Sys " + (v & 0xffff).toString(16);
  if (type === 0x08) return "Light fx";
  if (type === 0x09) return "Profile " + ((v & 255) + 1);
  if (type === 0x00) {
    const m = (v >> 16) & 255, k1 = (v >> 8) & 255, k0 = v & 255;
    const k = k1 || k0;
    const mods = MODS.filter((_, i) => m & (1 << i)).join("+");
    const kn = NAMES.get(k) || (k ? "0x" + k.toString(16) : "");
    if (mods && kn) return mods + "+" + kn;
  }
  return "0x" + v.toString(16).padStart(8, "0");
}
