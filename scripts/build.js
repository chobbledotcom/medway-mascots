import { join } from "node:path";
import { prep } from "./prepare-dev.js";
import { bun, fs, path } from "./utils.js";

const dev = path(".build", "dev");
const output = path("_site");

prep();

console.log("Building site...");

fs.rm(output);
bun.run("build", dev);
fs.mv(join(dev, "_site"), output);

console.log("Built to _site/");
