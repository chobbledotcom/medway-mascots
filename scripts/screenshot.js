import { readdirSync, cpSync } from "node:fs";
import { join } from "node:path";
import { setupTemplate } from "./template-utils.js";
import { bun, fs, path } from "./utils.js";

const USAGE = `
Usage: bun run screenshot [options] [page-paths...]

Take screenshots of your site pages.

Options:
  -v, --viewport <name>   Viewport to use: mobile, tablet, desktop, full-page (default: desktop)
  -a, --all-viewports     Capture all viewport variants for each page
  -d, --output-dir <dir>  Output directory (default: ./screenshots)
  -h, --help              Show this help message

Examples:
  bun run screenshot                           # Screenshot homepage at desktop viewport
  bun run screenshot /about /contact           # Screenshot multiple pages
  bun run screenshot -a /                      # Screenshot homepage at all viewports
  bun run screenshot -v mobile /products       # Screenshot products page at mobile viewport
  bun run screenshot -d ./my-screenshots /     # Save to custom directory

Page paths should start with / (e.g., /, /about, /products/item-1)
`;

const VIEWPORTS = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
  "full-page": { width: 1280, height: 4000 },
};

const BROWSER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-zygote",
  "--single-process",
];

const installPlaywrightBrowsers = async (tempDir) => {
  console.log("Installing Playwright browsers...");
  const proc = Bun.spawn(["bunx", "playwright", "install", "chromium"], {
    cwd: tempDir,
    stdio: ["inherit", "inherit", "inherit"],
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error("Failed to install Playwright browsers");
  }
};

const buildSite = (tempDir) => {
  console.log("Building site...");
  const result = bun.run("build", tempDir);
  if (result.exitCode !== 0) {
    throw new Error("Failed to build site");
  }
  console.log("Build complete.");
};

const runScreenshots = async (tempDir, args) => {
  const tempOutputDir = join(tempDir, "screenshots");

  // Determine final output directory
  let finalOutputDir = path("screenshots");
  const outputIdx = args.findIndex((a) => a === "-d" || a === "--output-dir");
  if (outputIdx !== -1 && args[outputIdx + 1]) {
    const outputPath = args[outputIdx + 1];
    finalOutputDir = outputPath.startsWith("/") ? outputPath : path(outputPath);
  }

  // Parse viewport option
  let viewport = "desktop";
  const viewportIdx = args.findIndex((a) => a === "-v" || a === "--viewport");
  if (viewportIdx !== -1 && args[viewportIdx + 1]) {
    viewport = args[viewportIdx + 1];
  }

  const allViewports = args.includes("-a") || args.includes("--all-viewports");

  // Get page paths
  const pagePaths = args.filter((a) => a.startsWith("/"));
  if (pagePaths.length === 0) {
    pagePaths.push("/");
  }

  // Ensure temp output dir exists
  fs.mkdir(tempOutputDir);

  // Build screenshot tasks
  const tasks = [];
  for (const pagePath of pagePaths) {
    if (allViewports) {
      for (const vp of Object.keys(VIEWPORTS)) {
        tasks.push({ pagePath, viewport: vp });
      }
    } else {
      tasks.push({ pagePath, viewport });
    }
  }

  // Run screenshot process in temp directory context (uses its installed Playwright)
  const screenshotCode = `
const { mkdirSync } = require('node:fs');
const { dirname, join } = require('node:path');

const VIEWPORTS = ${JSON.stringify(VIEWPORTS)};
const BROWSER_ARGS = ${JSON.stringify(BROWSER_ARGS)};
const tasks = ${JSON.stringify(tasks)};
const siteDir = '_site';
const outputDir = 'screenshots';
const port = 8080 + Math.floor(Math.random() * 1000);

const sanitizePagePath = (p) => p.replace(/^\\//, '').replace(/\\/$/, '').replace(/\\//g, '-') || 'home';

async function main() {
  // Start server
  console.log('Starting server on port ' + port + '...');
  const serverProc = Bun.spawn([
    'bun', '-e',
    \`Bun.serve({port:\${port},async fetch(req){const url=new URL(req.url);let p=url.pathname;if(p.endsWith('/'))p+='index.html';const file=Bun.file('\${siteDir}'+p);const exists=await file.exists();return exists?new Response(file):new Response('Not found',{status:404})}})\`
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  // Wait for server
  const baseUrl = 'http://localhost:' + port;
  for (let i = 0; i < 30; i++) {
    try {
      const resp = await fetch(baseUrl);
      if (resp.ok || resp.status === 404) break;
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  console.log('Server running at', baseUrl);

  // Take screenshots
  const { chromium } = await import('playwright');

  for (const task of tasks) {
    const { pagePath, viewport } = task;
    const { width, height } = VIEWPORTS[viewport] || VIEWPORTS.desktop;
    const suffix = viewport !== 'desktop' ? '-' + viewport : '';
    const outputPath = join(outputDir, sanitizePagePath(pagePath) + suffix + '.png');

    mkdirSync(dirname(outputPath), { recursive: true });

    const url = baseUrl + (pagePath.startsWith('/') ? '' : '/') + pagePath;
    console.log('Taking screenshot of', url, '(' + viewport + ')');

    const browser = await chromium.launch({ headless: true, args: BROWSER_ARGS });
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: outputPath, fullPage: viewport === 'full-page' });
    await browser.close();
    console.log('Screenshot saved:', outputPath);
  }

  serverProc.kill();
  console.log('Server stopped.');
}

main().catch(err => { console.error(err); process.exit(1); });
`;

  console.log("Taking screenshots...");
  const proc = Bun.spawn(["bun", "-e", screenshotCode], {
    cwd: tempDir,
    stdio: ["inherit", "inherit", "inherit"],
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`Screenshot process exited with code ${code}`);
  }

  // Copy screenshots to final output directory
  fs.mkdir(finalOutputDir);
  const files = readdirSync(tempOutputDir);
  for (const file of files) {
    cpSync(join(tempOutputDir, file), join(finalOutputDir, file));
  }
  console.log(`Screenshots saved to ${finalOutputDir}`);
};

const main = async () => {
  const args = process.argv.slice(2);

  if (args.includes("-h") || args.includes("--help")) {
    console.log(USAGE);
    return;
  }

  console.log("Setting up template environment...");
  const { tempDir, cleanup } = await setupTemplate();

  try {
    await installPlaywrightBrowsers(tempDir);
    buildSite(tempDir);
    await runScreenshots(tempDir, args);
  } finally {
    cleanup();
  }

  console.log("Done!");
};

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
