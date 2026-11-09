// Reversible round-trips on the Esc key (pos 1): Fn2-layer keycode, actuation, rapid trigger.
import { open } from "./hid-node.js";
const kb = open();
const P = 1; let ok = true;
const check = (name, cond) => { console.log(cond ? "PASS" : "FAIL", name); ok &&= cond; };
try {
  await kb.loadPrecision();
  // keymap on layer 2
  const k0 = (await kb.getKeys(2, [P]))[P];
  await kb.setKeys(2, { [P]: 0x68 }); // F13
  check("keymap write", (await kb.getKeys(2, [P]))[P] === 0x68);
  await kb.setKeys(2, { [P]: k0 });
  check("keymap restore", (await kb.getKeys(2, [P]))[P] === k0);
  // actuation
  const d0 = (await kb.getDistance([P]))[P];
  await kb.setDistance({ [P]: { mm: 1.5, global: 1 } });
  const d1 = (await kb.getDistance([P]))[P]; console.log("  distance now", d1);
  check("distance write (per-key)", Math.abs(d1.mm - 1.5) < 0.011 && d1.global === 1);
  await kb.setDistance({ [P]: d0 });
  check("distance restore", JSON.stringify((await kb.getDistance([P]))[P]) === JSON.stringify(d0));
  // rapid trigger
  const r0 = (await kb.getRT([P]))[P];
  await kb.setRT({ [P]: { on: true, up: 0.3, down: 0.2, global: 1 } });
  const r1 = (await kb.getRT([P]))[P]; console.log("  rt now", r1);
  check("rt write (per-key)", r1.global === 1 && r1.on && Math.abs(r1.up - 0.3) < 0.011 && Math.abs(r1.down - 0.2) < 0.011);
  await kb.setRT({ [P]: r0 });
  check("rt restore", JSON.stringify((await kb.getRT([P]))[P]) === JSON.stringify(r0));
  console.log(ok ? "ALL PASS" : "SOME FAILED");
} finally { kb.close(); }
