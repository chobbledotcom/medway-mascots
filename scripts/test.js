import { prep } from "./prepare-dev.js";
import { bun, fs, path } from "./utils.js";

const templateTest = path(".build", "template", "test");
const devTest = path(".build", "dev", "test");
const dev = path(".build", "dev");

prep();

if (fs.exists(templateTest)) {
  console.log("Copying test directory...");
  fs.rm(devTest);
  fs.cp(templateTest, devTest);
}

console.log("Running tests...");
bun.test(dev);
