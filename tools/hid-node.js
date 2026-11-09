// node-hid transport for the Hero68 protocol (used by CLI tools/tests).
import HID from "node-hid";
import { Hero68, VID, PID, REPORT_ID } from "../web/protocol.js";
import { KEYS } from "../web/layout.js";

export const POSITIONS = KEYS.map((k) => k.pos);

export function open({ verbose = false } = {}) {
  const info = HID.devices(VID, PID).find((d) => d.usagePage === 0xff00) || HID.devices(VID, PID).find((d) => d.usagePage >= 0xff00);
  if (!info) throw new Error("HERO 68 HE not found. Is it plugged in (wired)?");
  const dev = new HID.HID(info.path);
  const handlers = [];
  dev.on("data", (buf) => {
    // macOS hidapi delivers the report id as byte 0
    const r = buf[0] === REPORT_ID ? buf.subarray(1) : buf;
    if (verbose) console.error("IN ", Buffer.from(r.subarray(0, 16)).toString("hex"));
    handlers.forEach((h) => h(new Uint8Array(r)));
  });
  dev.on("error", (e) => console.error("hid error", e.message));
  const transport = {
    async send(frame) {
      if (verbose) console.error("OUT", Buffer.from(frame.subarray(0, 16)).toString("hex"));
      dev.write([REPORT_ID, ...frame]);
    },
    onReport(cb) { handlers.push(cb); },
  };
  const kb = new Hero68(transport);
  kb.close = () => dev.close();
  return kb;
}
