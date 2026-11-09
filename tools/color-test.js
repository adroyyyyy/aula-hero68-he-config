// Reversible per-key color test: read all, write Esc red, rewrite all 68 unchanged (multi-packet), restore.
import { open, POSITIONS } from "./hid-node.js";
const kb = open();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = true; const check = (n, c) => { console.log(c ? "PASS" : "FAIL", n); ok &&= c; };
try {
  const orig = await kb.getColors(POSITIONS);
  check("read 68 key colors", Object.keys(orig).length === 68);
  console.log("  sample:", JSON.stringify(Object.entries(orig).slice(0, 4)));
  const red = { r: 255, g: 0, b: 0 };
  await kb.setColors({ 1: red });
  check("write one key (Esc red)", JSON.stringify((await kb.getColors([1]))[1]) === JSON.stringify(red));
  await sleep(800);
  await kb.setColors(orig); // 68 keys -> 7 packets
  const back = await kb.getColors(POSITIONS);
  check("multi-packet restore of all 68", JSON.stringify(back) === JSON.stringify(orig));
  console.log(ok ? "ALL PASS" : "SOME FAILED");
} finally { kb.close(); }
