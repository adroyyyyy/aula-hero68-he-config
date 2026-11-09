// electron-builder afterPack hook: ad-hoc sign the macOS app (no Apple Developer ID needed).
// Without a valid signature, Apple Silicon Macs report downloaded copies as "damaged".
const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== "darwin") return;
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
  console.log("  • ad-hoc signed", path.basename(app), `(${ctx.arch === 1 ? "x64" : ctx.arch === 3 ? "arm64" : ctx.arch})`);
};
