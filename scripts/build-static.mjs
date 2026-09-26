import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(rootDirectory, "dist");
const rootFiles = ["index.html", "manifest.webmanifest", "sw.js"];
const assetDirectories = ["src", "assets", "icons"];

await rm(outputDirectory, { force: true, recursive: true });
await mkdir(outputDirectory, { recursive: true });

for (const file of rootFiles) {
  await cp(resolve(rootDirectory, file), resolve(outputDirectory, file));
}

for (const directory of assetDirectories) {
  await cp(resolve(rootDirectory, directory), resolve(outputDirectory, directory), { recursive: true });
}

console.log(`Built static app into ${outputDirectory}`);
