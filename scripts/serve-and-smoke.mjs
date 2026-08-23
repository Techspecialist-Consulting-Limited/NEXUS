/**
 * Smoke the production build.
 *
 * The dev server compiles routes on demand, and on Windows those manifest
 * writes intermittently lose a race with the filesystem — which surfaces as
 * scattered 500s on whichever route happened to compile under load. Those look
 * exactly like real route failures in a report and are not, which is worse
 * than useless: it teaches you to skim past red.
 *
 * `next start` serves an already-built app, so nothing compiles mid-run. It is
 * also what an actual user gets, which is the thing worth verifying.
 *
 * Usage:  node scripts/serve-and-smoke.mjs        (expects `next build` first)
 */

import { spawn } from "node:child_process";
import { once } from "node:events";

const PORT = process.env.PORT ?? "3100";
const BASE = `http://localhost:${PORT}`;

function run(command, args, env) {
  return spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    env: { ...process.env, ...env },
  });
}

async function waitFor(url, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (res.status < 500) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 750));
  }
  return false;
}

/*
 * Refuse to run against something already on the port.
 *
 * A leftover `next start` serves the PREVIOUS build, whose chunk hashes no
 * longer match the freshly built HTML — so the stylesheet 404s and every
 * element measures at its unstyled height. That reports as a page full of
 * layout failures rather than as "you are testing the wrong server", which is
 * a genuinely misleading half hour.
 */
try {
  const stale = await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(2000) });
  if (stale.ok) {
    console.error(
      `Something is already serving ${BASE}. Stop it first — otherwise this ` +
        `run would test that build, not the one just compiled.`,
    );
    process.exit(1);
  }
} catch {
  // Nothing there. Good.
}

/*
 * Build here rather than in the npm script, so the sweep always runs against
 * the code as it is right now rather than whatever was last compiled.
 */
const DEMO_ENV = {
  // Run the seeded demo org with the persona switcher, whatever .env.local
  // points at. Read on the server at runtime, so no build-time inlining is
  // involved and nothing has to be blanked.
  NEXUS_FORCE_DEMO_AUTH: "1",
  NEXUS_ALLOW_DEMO_AUTH: "1",
  // ...and the seeded demo database it expects to find them in.
  NEXUS_FORCE_LOCAL_DB: "1",
  /*
   * ...and the offline model.
   *
   * This sweep checks layout across 80-odd page loads. Against a real
   * deployment that is minutes of billed, non-deterministic latency, and a
   * model hiccup surfaces as a 500 that looks like a UI defect — which is
   * exactly how a schema mismatch in narrate() was first mistaken for a React
   * error. Model behaviour is verified separately by scripts/check-azure.mts.
   */
  NEXUS_FORCE_MOCK_AI: "1",
};

console.log("building...");
const build = run("npx", ["next", "build"], DEMO_ENV);
let buildOutput = "";
build.stdout.on("data", (d) => (buildOutput += d.toString()));
build.stderr.on("data", (d) => (buildOutput += d.toString()));
const [buildCode] = await once(build, "exit");
if (buildCode !== 0) {
  // Show why. Swallowing the compiler output turns a one-line type error into
  // an unexplained "build failed".
  console.error("build failed:");
  console.error(buildOutput.trim().split(String.fromCharCode(10)).slice(-25).join(String.fromCharCode(10)));
  process.exit(1);
}

const server = run("npx", ["next", "start", "--port", PORT], {
  ...DEMO_ENV,
  NODE_ENV: "production",
});

let serverOutput = "";
server.stdout.on("data", (d) => (serverOutput += d.toString()));
server.stderr.on("data", (d) => (serverOutput += d.toString()));

process.on("exit", () => server.kill());

console.log(`starting production server on ${PORT}...`);
const up = await waitFor(`${BASE}/login`);
if (!up) {
  console.error("server never became ready:\n" + serverOutput.slice(-2000));
  server.kill();
  process.exit(1);
}

// The first authenticated request builds the local demo database.
console.log("warming the demo database...");
await fetch(`${BASE}/`, { signal: AbortSignal.timeout(300_000) }).catch(() => {});

const smoke = run("node", ["scripts/smoke.mjs", BASE]);
smoke.stdout.pipe(process.stdout);
smoke.stderr.pipe(process.stderr);

const [code] = await once(smoke, "exit");
server.kill();
process.exit(code ?? 1);
