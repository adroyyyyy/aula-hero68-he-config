// Does painting a few keys disturb the rest? Fill white, paint WASD red, read all. Restores original colors+mode.
import { open, POSITIONS } from "./hid-node.js";
const kb = open();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const origColors = await kb.getColors(POSITIONS), origLight = await kb.getLight();
  console.log("current mode", origLight.mode, "| distinct colors now:", [...new Set(Object.values(origColors).map((c) => `${c.r},${c.g},${c.b}`))].join("  "));
  const W = { r: 247, g: 141, b: 142 }, R = { r: 247, g: 0, b: 0 };
  await kb.setLight({ ...origLight, mode: 19 });
  await kb.setColors(Object.fromEntries(POSITIONS.map((p) => [p, W])));
  await kb.setColors({ 30: R, 43: R, 44: R, 45: R });
  const after = await kb.getColors(POSITIONS);
  const notWhite = Object.entries(after).filter(([p, c]) => ![30, 43, 44, 45].includes(+p) && (c.r !== 247 || c.g !== 141 || c.b !== 142));
  const wasdRed = [30, 43, 44, 45].every((p) => after[p].r === 247 && after[p].g === 0);
  console.log("WASD red:", wasdRed, "| other keys changed by partial write:", notWhite.length, notWhite.slice(0, 5).map(([p, c]) => p + "=" + JSON.stringify(c)).join(" "));
  await sleep(2500);
  await kb.setColors(origColors); await kb.setLight(origLight);
  console.log("restored:", JSON.stringify(await kb.getColors(POSITIONS)) === JSON.stringify(origColors));
} finally { kb.close(); }
