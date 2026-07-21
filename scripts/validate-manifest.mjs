#!/usr/bin/env node

import manifest from "../src/data/project-manifest.js";
import { validateManifest } from "../src/scene/manifestValidator.js";

function formatIssue(issue) {
  const location = issue.path ? ` (${issue.path})` : "";
  const entities = issue.entityIds?.length ? ` [${issue.entityIds.join(", ")}]` : "";
  return `${issue.severity.toUpperCase()} ${issue.code}${location}${entities}: ${issue.message}`;
}

export function runManifestValidation(projectManifest = manifest) {
  const result = validateManifest(projectManifest);
  const lines = [];

  if (result.warnings.length > 0) {
    lines.push(`Manifest warnings (${result.warnings.length}):`);
    result.warnings.forEach((item) => lines.push(`  ${formatIssue(item)}`));
  }

  if (result.errors.length > 0) {
    lines.push(`Manifest errors (${result.errors.length}):`);
    result.errors.forEach((item) => lines.push(`  ${formatIssue(item)}`));
  }

  const status = result.ok && result.stats.unresolvedCollisions === 0 ? "PASS" : "FAIL";
  if (result.stats.collisionStages?.length) {
    lines.push(`Collision stages: ${result.stats.collisionStages.map((stage) => `${stage.id}=${stage.unresolvedCollisions}`).join(", ")}.`);
  }
  lines.push(
    `Manifest ${status}: ${result.stats.rooms} rooms, ${result.stats.walls} walls, `
      + `${result.stats.glazing} glazing units, ${result.stats.devices} devices, `
      + `${result.stats.unresolvedCollisions} unresolved collisions, `
      + `${result.errors.length} errors, ${result.warnings.length} warnings.`,
  );
  console.log(lines.join("\n"));

  return result;
}

const result = runManifestValidation();
if (!result.ok || result.stats.unresolvedCollisions !== 0) process.exitCode = 1;
