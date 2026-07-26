#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

const requiredFiles = [
  "package.json",
  "index.html",
  "ARCHITECTURE.md",
  "QA.md",
  "PRODUCT.md",
  "DESIGN.md",
  "vite.config.mjs",
  "src/App.jsx",
  "src/main.jsx",
  "src/data/project-manifest.js",
  "src/data/project-manifest-v2.js",
  "src/scene/buildArchitecture.js",
  "src/scene/buildGlazing.js",
  "src/scene/buildDoors.js",
  "src/scene/buildDebug.js",
  "src/scene/buildFurniture.js",
  "src/scene/buildLights.js",
  "src/scene/buildCurtains.js",
  "src/scene/collisionValidator.js",
  "src/scene/manifestValidator.js",
  "src/scene/presentationLayout.js",
  "src/scene/SmartHomeScene.jsx",
  "public/reference/final-plan-cropped-physical-24.png",
  "public/reference/light-plan-cropped-physical-31.png",
  "scripts/validate-manifest.mjs",
  "scripts/check-project.mjs",
  "tests/presentation-layout.test.mjs",
  "tests/rebuild-manifest.test.mjs",
  "tests/validator.test.mjs",
];

function record(condition, message) {
  if (!condition) failures.push(message);
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    if ([".git", ".npm-cache", "dist", "node_modules"].includes(name)) return [];
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function runNode(label, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) failures.push(`${label} could not start: ${result.error.message}`);
  else if (result.status !== 0) failures.push(`${label} exited with code ${result.status ?? "unknown"}.`);
}

for (const relativePath of requiredFiles) {
  record(existsSync(join(projectRoot, relativePath)), `Missing required project file: ${relativePath}`);
}

let packageJson;
try {
  packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
} catch (error) {
  failures.push(`package.json cannot be parsed: ${error instanceof Error ? error.message : String(error)}`);
}

if (packageJson) {
  record(typeof packageJson.scripts?.validate === "string", "package.json must define scripts.validate.");
  record(typeof packageJson.scripts?.check === "string", "package.json must define scripts.check.");
  const checkCommand = packageJson.scripts?.check ?? "";
  record(!/(?:^|\s)(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?check(?:\s|$)/u.test(checkCommand), "scripts.check must not recursively invoke a package-manager check command.");
}

const manifestPath = join(projectRoot, "src/data/project-manifest.js");
if (existsSync(manifestPath)) {
  const manifestSource = readFileSync(manifestPath, "utf8");
  record(!/^\s*import\s+.*(?:react|three)/imu.test(manifestSource), "Project data must not import React or Three.js.");
  record(!/(?:mqtt|wss?):\/\//iu.test(manifestSource), "Project manifest must not contain live MQTT/WebSocket endpoints.");
  record(!/(?:api[_-]?key|access[_-]?token|password)\s*[:=]\s*["'][^"']+["']/iu.test(manifestSource), "Project manifest appears to contain a credential.");
}

for (const path of walk(projectRoot).filter((file) => [".js", ".mjs"].includes(extname(file)))) {
  const relativePath = path.slice(projectRoot.length + 1);
  const syntax = spawnSync(process.execPath, ["--check", relativePath], { cwd: projectRoot, encoding: "utf8" });
  if (syntax.status !== 0) failures.push(`Syntax check failed for ${relativePath}: ${(syntax.stderr || syntax.stdout).trim()}`);
}

const testFiles = readdirSync(join(projectRoot, "tests"))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => `tests/${name}`);
runNode("Project tests", ["--test", ...testFiles]);
runNode("Manifest validation", ["scripts/validate-manifest.mjs"]);
runNode("Production JSX/bundle check", ["node_modules/vite/bin/vite.js", "build"]);

if (failures.length > 0) {
  console.error(`Project check FAIL (${failures.length}):`);
  failures.forEach((message) => console.error(`  - ${message}`));
  process.exitCode = 1;
} else {
  console.log("Project check PASS: static checks, production JSX/bundle check, project tests, and manifest validation succeeded.");
}
