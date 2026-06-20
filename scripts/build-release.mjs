import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const releaseDir = join(process.cwd(), "release");
const tempOutDir = join(tmpdir(), "mcaisd-electron-builder-out");

run("npm", ["run", "build"]);
run("npm", ["run", "build:electron"]);

rmSync(tempOutDir, { recursive: true, force: true });

run("npx", [
  "electron-builder",
  "--win",
  "nsis",
  "portable",
  "--x64",
  "--publish",
  "never",
  `--config.directories.output=${tempOutDir}`,
], {
  ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || "https://npmmirror.com/mirrors/electron/",
  ELECTRON_BUILDER_BINARIES_MIRROR:
    process.env.ELECTRON_BUILDER_BINARIES_MIRROR || "https://npmmirror.com/mirrors/electron-builder-binaries/",
});

rmSync(releaseDir, { recursive: true, force: true });
mkdirSync(releaseDir, { recursive: true });
cpSync(tempOutDir, releaseDir, { recursive: true });

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    env: { ...process.env, ...env },
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
