// HERO 68 HE physical layout: a standard 68-key (65%) grid, in key units (1u = one alpha key).
// Each key: [name, pos, default keycode, width in u]. `pos` is the keyboard's own key ID used by the
// protocol; default keycodes are standard USB HID usages (modifiers in byte 2).
const M = (bit) => (bit << 16) >>> 0;
const ROWS = [
  [["Esc", 1, 0x29], ["1", 15, 0x1e], ["2", 16, 0x1f], ["3", 17, 0x20], ["4", 18, 0x21], ["5", 19, 0x22], ["6", 20, 0x23], ["7", 21, 0x24],
   ["8", 22, 0x25], ["9", 23, 0x26], ["0", 24, 0x27], ["-_", 25, 0x2d], ["=+", 26, 0x2e], ["Backspace", 27, 0x2a, 2], ["Insert", 98, 0x49]],
  [["Tab", 28, 0x2b, 1.5], ["Q", 29, 0x14], ["W", 30, 0x1a], ["E", 31, 0x08], ["R", 32, 0x15], ["T", 33, 0x17], ["Y", 34, 0x1c], ["U", 35, 0x18],
   ["I", 36, 0x0c], ["O", 37, 0x12], ["P", 38, 0x13], ["[{", 39, 0x2f], ["]}", 40, 0x30], ["\\|", 41, 0x31, 1.5], ["Delete", 99, 0x4c]],
  [["Caps", 42, 0x39, 1.75], ["A", 43, 0x04], ["S", 44, 0x16], ["D", 45, 0x07], ["F", 46, 0x09], ["G", 47, 0x0a], ["H", 48, 0x0b], ["J", 49, 0x0d],
   ["K", 50, 0x0e], ["L", 51, 0x0f], [";:", 52, 0x33], ["'\"", 53, 0x34], ["Enter", 54, 0x28, 2.25], ["PgUp", 102, 0x4b]],
  [["L_Shift", 55, M(0x02), 2.25], ["Z", 56, 0x1d], ["X", 57, 0x1b], ["C", 58, 0x06], ["V", 59, 0x19], ["B", 60, 0x05], ["N", 61, 0x11], ["M", 62, 0x10],
   [",<", 63, 0x36], [".>", 64, 0x37], ["/?", 65, 0x38], ["R_Shift", 66, M(0x20), 1.75], ["Up", 74, 0x52], ["PgDn", 103, 0x4e]],
  [["L_Ctrl", 67, M(0x01), 1.25], ["L_WIN", 68, M(0x08), 1.25], ["L_Alt", 69, M(0x04), 1.25], ["Space", 70, 0x2c, 6.25], ["R_Alt", 71, M(0x40)],
   ["Fn1", 72, 0x0d000000], ["R_Ctrl", 73, M(0x10)], ["Left", 76, 0x50], ["Down", 75, 0x51], ["Right", 77, 0x4f]],
];

export const UNIT = 45;        // px per key unit in the drawing
export const BOARD_W = 16 * UNIT;
export const BOARD_H = ROWS.length * UNIT;
const GAP = 4;

export const KEYS = [];
export const FACTORY = { 0: {} };
ROWS.forEach((row, r) => {
  let x = 0;
  for (const [name, pos, code, w = 1] of row) {
    KEYS.push({ pos, name, x: x * UNIT + GAP / 2, y: r * UNIT + GAP / 2, w: w * UNIT - GAP, h: UNIT - GAP });
    FACTORY[0][pos] = code >>> 0;
    x += w;
  }
});
