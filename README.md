# HERO68 Config

An open-source desktop configurator for the **AULA HERO 68 HE** magnetic keyboard. It replaces AULA's web driver and works with the keyboard's stock firmware, so nothing gets flashed.

- **Remap** any key on the base, Fn1 and Fn2 layers.
- **Actuation point** per key or for the whole board (0.05–3.3 mm).
- **Rapid Trigger**, with separate press and release sensitivity.
- **Lighting**: effect, color, brightness, speed.
- **Per-key colors**: a brush tool (click or drag across keys), plus white-balance correction for the board's LEDs.
- **Polling rate** from 125 Hz to 8 kHz.
- **Mac/Windows mode**, with Command/Option labels in Mac mode, and Win-key lock.
- **Backup / restore**, plus a one-click "undo everything since connecting".

The keyboard connects automatically, with no browser and no permission popups. Every change is written immediately and read back to confirm.

> Unofficial. Not affiliated with AULA. Use at your own risk, although the app refuses to send factory-reset, calibration and other destructive commands.

## Install

Download the latest release, or build it yourself:

```bash
npm install
npm start          # run in development
npm run dist       # build dist/mac-arm64/HERO68 Config.app
```

The builds aren't code-signed. On macOS, right-click the app and choose **Open** the first time.

Close AULA's website before using this app. Only one program can talk to the keyboard at a time.

## Developer tools

```bash
npm run backup                          # read-only: full config -> backups/*.json
node tools/write-test2.js               # reversible write round-trip on the Esc key
npm test -- backups/<file>.json         # UI test against a simulated keyboard
```

## Project layout

| path | what |
|---|---|
| `app/main.js` | Electron main process: window, single-instance lock, IPC. |
| `app/hid-worker.cjs` | USB HID connection (node-hid) in a utility process, with plug/unplug detection. Killed on quit, because node-hid's read thread can otherwise block exit. |
| `app/preload.cjs` | Minimal IPC bridge exposed to the UI. |
| `web/protocol.js` | The keyboard protocol. Transport-agnostic, so it also works over WebHID. |
| `web/app.js`, `index.html` | The UI. |
| `web/layout.js` | Physical key positions and factory keymaps. |
| `web/keycodes.js` | Keycode names. |

## Protocol

- HID report ID 9 on the vendor interface (usage page 0xFF00), 63-byte frames.
- Frame layout: `[cmd, sub, 0, total=1, index=0, len, data…, checksum]`.
- Checksum: `255 - (9 + sum(bytes[0..61])) % 256`.
- Replies echo the command byte.

| cmd | what |
|---|---|
| 0x82 | info: sub 1 uuid, 2 firmware, 6/8 precision |
| 0x83 / 0x03 | read / write keymap (sub = layer); 6 bytes/key: pos(2) + keycode(4) |
| 0x84 / 0x04 | read / write setting: sub 1 lighting, 17 OS mode, 21 Win lock, 23 polling |
| 0x93 / 0x13 | read / write actuation: pos(2), value(2) in 0.01 mm, global(1) |
| 0x99 / 0x19 | read / write rapid trigger: pos(2), on(1), release(2), press(2), global(1) |
| 0x86 / 0x06 | read / write per-key RGB: pos(2), r, g, b. Writes are multi-packet (`[3]` = total, `[4]` = index). |
| 0x90 | active profile |

Polling level to rate: 4 = 8000, 5 = 4000, 6 = 2000, 0 = 1000, 1 = 500, 2 = 250, 3 = 125 Hz. After a polling change the keyboard re-enumerates on USB and sends no ack.

The `global` byte means 0 = the key follows the global setting, 1 = per-key value.

Keycodes are 32-bit:
- low byte: USB HID usage
- byte 2: modifier bits
- top byte: type (`0x02` media, `0x07` system, `0x08` lighting control, `0x09` profile, `0x0d` Fn layer)

**Never sent (blocked in `protocol.js`):** `0x11` (reset), `0x16` (safe area), `0x94`/`0x98` (calibration), `0x12` (advanced keys), `0x05` (macros).

## Roadmap

- Macros
- Advanced keys (DKS, Mod-Tap, Toggle, SOCD)
- Profiles
- More AULA HE boards. They use the same protocol, so each one mainly needs a layout file.
- Windows/Linux builds (the code is cross-platform; the builds are untested)

## License

MIT
