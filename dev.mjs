import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const children = [
  spawn(process.execPath, ["server/index.mjs"], { cwd: root, stdio: "inherit", env: { ...process.env, API_PORT: process.env.API_PORT ?? "3001" } }),
  spawn("corepack", ["pnpm", "exec", "vite", "--host", "0.0.0.0", "--port", process.env.PORT ?? "3000"], { cwd: root, stdio: "inherit", env: process.env }),
];
let shuttingDown = false;
function stop(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 8000).unref();
}
for (const child of children) child.on("exit", (code) => { if (!shuttingDown) stop(code ?? 1); });
process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));
