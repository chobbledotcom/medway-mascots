import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, copyFileSync, unlinkSync } from "node:fs";
import { extname, join, resolve, relative } from "node:path";

// Paths
export const root = resolve(import.meta.dir, "..");
export const path = (...segments) => join(root, ...segments);

// File operations using Bun APIs
export const file = (p) => Bun.file(p);
export const exists = (p) => file(p).exists();
export const read = (p) => file(p).text();
export const readJson = async (p) => JSON.parse(await read(p));
export const write = Bun.write;

// Filesystem commands
export const fs = {
  exists: existsSync,
  rm: (p) => rmSync(p, { recursive: true, force: true }),
  mkdir: (p) => mkdirSync(p, { recursive: true }),
  cp: (src, dest) => cpSync(src, dest, { recursive: true }),
  mv: renameSync,
};

// Shell primitives
export const run = (cmd, opts = {}) =>
  Bun.spawnSync(cmd, { stdio: ["inherit", "inherit", "inherit"], ...opts });

export const shell = (cmd, opts = {}) => run(["sh", "--", "-c", cmd], opts);

export const spawn = (cmd, opts = {}) =>
  Bun.spawn(cmd, { stdio: ["inherit", "inherit", "inherit"], ...opts });

// Git commands
export const git = {
  clone: (repo, dest, opts = {}) =>
    run(["git", "clone", "--depth", String(opts.depth || 1), repo, dest]),

  pull: (dir) =>
    run(["git", "--git-dir", join(dir, ".git"), "--work-tree", dir, "pull"]),

  reset: (dir, opts = {}) =>
    run([
      "git",
      "--git-dir",
      join(dir, ".git"),
      "--work-tree",
      dir,
      "reset",
      opts.hard ? "--hard" : "--soft",
    ]),
};

// Rsync implementation (pure JS, no system rsync needed)
const minimatch = (name, pattern) => {
  if (pattern.startsWith("**/"))
    return minimatch(name, pattern.slice(3)) || name.includes("/") && minimatch(name.slice(name.indexOf("/") + 1), pattern);
  if (pattern.startsWith("*."))
    return name.endsWith(pattern.slice(1));
  if (pattern.endsWith("/"))
    return name === pattern.slice(0, -1);
  if (pattern.includes("*")) {
    const re = new RegExp("^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
    return re.test(name);
  }
  return name === pattern;
};

const matchesAny = (name, patterns) => patterns.some((p) => minimatch(name, p));

const walkDir = (dir) => {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push({ path: full, name: entry.name, isDir: true });
      results.push(...walkDir(full));
    } else {
      results.push({ path: full, name: entry.name, isDir: false });
    }
  }
  return results;
};

export const rsync = (src, dest, opts = {}) => {
  const srcDir = src.endsWith("/") ? src : `${src}/`;
  const destDir = dest.endsWith("/") ? dest : `${dest}/`;
  const excludes = opts.exclude || [];
  const includes = opts.include || [];
  const hasIncludes = includes.length > 0;

  mkdirSync(destDir, { recursive: true });

  const srcEntries = walkDir(srcDir);
  const copiedPaths = new Set();

  for (const entry of srcEntries) {
    const rel = relative(srcDir, entry.path);
    const segments = rel.split("/");
    const name = segments[segments.length - 1];

    if (segments.some((s) => matchesAny(s, excludes)) || matchesAny(rel, excludes)) continue;
    if (hasIncludes && !entry.isDir && !matchesAny(name, includes) && !matchesAny(rel, includes)) continue;

    const destPath = join(destDir, rel);
    copiedPaths.add(rel);

    if (entry.isDir) {
      mkdirSync(destPath, { recursive: true });
    } else {
      if (opts.update && existsSync(destPath)) {
        const srcMtime = statSync(entry.path).mtimeMs;
        const destMtime = statSync(destPath).mtimeMs;
        if (srcMtime <= destMtime) continue;
      }
      mkdirSync(join(destDir, ...segments.slice(0, -1)), { recursive: true });
      copyFileSync(entry.path, destPath);
    }
  }

  if (opts.delete) {
    const destEntries = walkDir(destDir);
    for (const entry of destEntries.reverse()) {
      const rel = relative(destDir, entry.path);
      if (!copiedPaths.has(rel)) {
        if (entry.isDir) {
          rmSync(entry.path, { recursive: true, force: true });
        } else {
          unlinkSync(entry.path);
        }
      }
    }
  }
};

// Bun commands
export const bun = {
  install: (cwd) => run(["bun", "install"], { cwd }),
  run: (script, cwd) => run(["bun", "run", script], { cwd }),
  test: (cwd) => run(["bun", "test"], { cwd }),
  spawn: (script, cwd) => spawn(["bun", "run", script], { cwd, shell: true }),
};

// Find commands
export const find = {
  deleteByExt: (dir, ext) =>
    shell(`find "${dir}" -type f -name "*${ext}" -delete 2>/dev/null || true`),
};

// Utilities
export const ext = extname;

export const debounce = (fn, ms) => {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};

export const loadEnv = async (p = path(".env")) => {
  if (!(await exists(p))) return;
  for (const line of (await read(p)).split("\n")) {
    const [key, ...val] = line.split("=");
    if (key && val.length && !process.env[key]) {
      process.env[key] = val.join("=").trim();
    }
  }
};
