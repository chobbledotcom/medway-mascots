import { join } from "node:path";
import { setupTemplate } from "./template-utils.js";
import { bun, exists, fs, path, read, write } from "./utils.js";

const TEMPLATE_RAW_URL =
  "https://raw.githubusercontent.com/chobbledotcom/chobble-template/refs/heads/main/.pages.yml";

const fetchPages = async () => {
  console.log("Fetching .pages.yml from chobble-template...");

  const res = await fetch(TEMPLATE_RAW_URL);
  if (!res.ok) throw new Error(`Failed to fetch .pages.yml: ${res.status}`);

  await write(".pages.yml", (await res.text()).replace(/src\//g, ""));
  console.log("Updated .pages.yml from chobble-template (with src/ removed)");
};

const customisePages = async () => {
  const { tempDir, cleanup } = await setupTemplate({ mergeSite: false });

  try {
    // Remove template's page-layouts to avoid interference with customisation
    // (but keep an empty directory so pageLayouts.js doesn't fail)
    const templatePageLayouts = join(tempDir, "src", "_data", "page-layouts");
    fs.rm(templatePageLayouts);
    fs.mkdir(templatePageLayouts);

    // Copy local site.json and .pages.yml to the template so customise-cms uses them as defaults
    const localSiteJson = path("_data", "site.json");
    const localPagesYml = path(".pages.yml");
    const templateSiteJson = join(tempDir, "src", "_data", "site.json");
    const templatePagesYml = join(tempDir, ".pages.yml");

    if (await exists(localSiteJson)) {
      console.log("Copying local site.json to template...");
      await write(templateSiteJson, await read(localSiteJson));
    }
    if (await exists(localPagesYml)) {
      console.log("Copying local .pages.yml to template...");
      // Add src/ prefix back when copying to template
      await write(
        templatePagesYml,
        (await read(localPagesYml)).replace(
          /^(\s+folder:\s*)(?!src\/)/gm,
          "$1src/",
        ),
      );
    }

    console.log("\nStarting CMS customisation TUI...\n");

    const proc = bun.spawn("customise-cms", tempDir);
    const code = await proc.exited;

    if (code !== 0) {
      throw new Error(`customise-cms exited with code ${code}`);
    }

    if (!(await exists(templatePagesYml))) {
      throw new Error("No .pages.yml found after customisation");
    }

    // Copy amended files back
    await write(
      ".pages.yml",
      (await read(templatePagesYml)).replace(/src\//g, ""),
    );
    await write(localSiteJson, await read(templateSiteJson));

    console.log("Updated .pages.yml and site.json with your customisations");
  } finally {
    cleanup();
  }
};

const updatePages = async ({ customise = false } = {}) =>
  customise ? customisePages() : fetchPages();

if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`Usage: bun run update-pages [options]

Options:
  --customise, -c  Run the interactive CMS customisation TUI
  --help, -h       Show this help message

Without options, fetches the latest .pages.yml from chobble-template.
With --customise, clones chobble-template and runs the customise-cms TUI
to let you select which collections to include.`);
    process.exit(0);
  }

  const customise = args.includes("--customise") || args.includes("-c");

  updatePages({ customise }).catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}

export { updatePages, fetchPages, customisePages };
