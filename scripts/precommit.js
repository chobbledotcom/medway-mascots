#!/usr/bin/env bun

/**
 * Precommit hook - runs lint and copy-paste detection.
 * Use --verbose flag to see full output from all checks.
 */

import {
  COMMON_STEPS,
  runSteps,
} from "@chobble/js-toolkit/code-quality/runner";

const verbose = process.argv.includes("--verbose");

const steps = [COMMON_STEPS.lintFix, COMMON_STEPS.cpd];

console.log(
  verbose
    ? "Running precommit checks (verbose)...\n"
    : "Running precommit checks...",
);

runSteps({
  steps,
  verbose,
  title: "PRECOMMIT SUMMARY",
  rootDir: process.cwd(),
});
