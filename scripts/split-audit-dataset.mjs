import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { splitDatasetByGroup } from "../src/audit-split.mjs";

const inputPath = resolve(process.argv[2] || "work/audit-dataset.json");
const outputPath = resolve(process.argv[3] || "work/audit-split.json");
const dataset = JSON.parse(await readFile(inputPath, "utf8"));
const split = splitDatasetByGroup(dataset.cases || dataset, {
  seed: process.env.AUDIT_SPLIT_SEED || "tryon-audit-v1",
});
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: inputPath,
  ...split,
}, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, output: outputPath, summary: split.summary }, null, 2));
