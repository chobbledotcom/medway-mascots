import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { extname, join, resolve } from "node:path";

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

// Rsync commands
const rsyncExcludes = (list) => list.flatMap((e) => ["--exclude", e]);
const rsyncIncludes = (list) => list.flatMap((e) => ["--include", e]);

export const rsync = (src, dest, opts = {}) =>
  run([
    "rsync",
    "--recursive",
    ...(opts.update ? ["--update"] : []),
    ...(opts.delete ? ["--delete"] : []),
    ...rsyncExcludes(opts.exclude || []),
    ...rsyncIncludes(opts.include || []),
    src.endsWith("/") ? src : `${src}/`,
    dest.endsWith("/") ? dest : `${dest}/`,
  ]);

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
