// Read-only: dumps the keyboard's full config to backups/<timestamp>.json
import fs from "node:fs";
import path from "node:path";
import { open, POSITIONS } from "./hid-node.js";

const kb = open({ verbose: process.argv.includes("-v") });
try {
  const snap = await kb.snapshot(POSITIONS);
  const dir = path.join(import.meta.dirname, "..", "backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `backup-${snap.time.replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(snap, null, 1));
  console.log("saved", file);
  console.log(JSON.stringify({ uuid: snap.uuid, firmware: "0x" + snap.firmware.toString(16), precision: snap.precision, profile: snap.profile, light: snap.light, os: snap.os, winLock: snap.winLock, polling: snap.polling }, null, 1));
  console.log("keys per layer:", Object.values(snap.keys).map((l) => Object.keys(l).length));
  console.log("distance sample:", JSON.stringify(Object.entries(snap.distance).slice(0, 4)));
  console.log("rt sample:", JSON.stringify(Object.entries(snap.rt).slice(0, 3)));
} finally {
  kb.close();
}
