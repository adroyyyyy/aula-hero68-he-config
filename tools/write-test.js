// Reversible write test: brightness 20 -> 10 -> restore. Then a keymap round-trip on an unused Fn2 slot? No: only brightness.
import { open } from "./hid-node.js";
const kb = open();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const orig = await kb.getLight();
  console.log("before ", orig);
  await kb.setLight({ ...orig, bright: Math.max(0, orig.bright - 10) });
  const mid = await kb.getLight();
  console.log("after  ", mid);
  await sleep(1200);
  await kb.setLight(orig);
  const back = await kb.getLight();
  console.log("restore", back);
  console.log(JSON.stringify(back) === JSON.stringify(orig) && mid.bright === Math.max(0, orig.bright - 10) ? "PASS" : "MISMATCH");
} finally { kb.close(); }
