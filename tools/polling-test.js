// Polling rate round-trip: 4000 -> 1000 -> original. Handles the keyboard re-enumerating.
import { open } from "./hid-node.js";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RATE = { 4: 8000, 5: 4000, 6: 2000, 0: 1000, 1: 500, 2: 250, 3: 125 };
async function withKb(fn) { for (let i = 0; i < 20; i++) { try { const kb = open(); try { return await fn(kb); } finally { kb.close(); } } catch (e) { await sleep(500); if (i === 19) throw e; } } }
const orig = await withKb((kb) => kb.getPolling());
console.log("current:", orig, "=", RATE[orig], "Hz");
let t0 = Date.now();
await withKb(async (kb) => { try { await kb.setPolling(0); console.log("set 1000 Hz: acked"); } catch (e) { console.log("set 1000 Hz: no ack (", e.message, ")"); } });
await sleep(1500);
const now = await withKb((kb) => kb.getPolling());
console.log("after:", now, "=", RATE[now], "Hz", "(reconnect+read took", Date.now() - t0, "ms)");
await withKb(async (kb) => { try { await kb.setPolling(orig); } catch {} });
await sleep(1500);
const back = await withKb((kb) => kb.getPolling());
console.log("restored:", back, "=", RATE[back], "Hz", back === orig && now === 0 ? "PASS" : "CHECK");
