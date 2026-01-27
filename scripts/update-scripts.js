#!/usr/bin/env bun

/**
 * Update scripts from chobble-client repo
 * Copies scripts from chobbledotcom/chobble-client over our own
 * without deleting any extra scripts we've added locally
 */

import { $ } from "bun";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join, dirname } from "path";

const REPO_URL = "https://github.com/chobbledotcom/chobble-client.git";
const SCRIPT_DIR = dirname(import.meta.path);

async function main() {
  const tempDir = await mkdtemp(join(tmpdir(), "chobble-client-"));

  try {
    console.log("Fetching scripts from chobble-client...");

    // Clone with sparse checkout for just the scripts directory
    await $`git clone --depth 1 --filter=blob:none --sparse ${REPO_URL} ${tempDir}/chobble-client`.quiet();
    await $`git -C ${tempDir}/chobble-client sparse-checkout set scripts`.quiet();

    const sourceDir = join(tempDir, "chobble-client", "scripts");

    console.log("Copying scripts...");

    // rsync: copy files, preserve structure, don't delete extras, exclude this script
    await $`rsync -av --exclude='update-scripts.js' --exclude='update-scripts.sh' ${sourceDir}/ ${SCRIPT_DIR}/`;

    console.log("Done! Your local-only scripts have been preserved.");
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  } finally {
    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  }
}

main();
