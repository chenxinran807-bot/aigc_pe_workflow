import { mkdir, readFile, writeFile } from "node:fs/promises";
import path, { resolve } from "node:path";

import { buildAuditDetailImages } from "../src/audit-detail-images.mjs";
import { buildDetailManifest, TARGET_DETAIL_CASE_IDS } from "../src/audit-detail-manifest.mjs";

const sourceRoot = resolve(process.argv[2] || "work/crop-experiment");
const outputRoot = resolve(process.argv[3] || "work/named-detail-experiment");
const sourceManifest = JSON.parse(await readFile(path.join(sourceRoot, "manifest.json"), "utf8"));
const sourceByCase = new Map(sourceManifest.cases.map((item) => [item.caseId, item]));
const originalCases = [];
const detailsByCase = {};

for (const caseId of TARGET_DETAIL_CASE_IDS) {
  if (!sourceByCase.has(caseId)) throw new Error(`missing source case: ${caseId}`);
  const sourceDir = path.join(sourceRoot, caseId);
  const files = {
    user: path.join(sourceDir, "user-source"),
    outfit: path.join(sourceDir, "outfit-source"),
    generated: path.join(sourceDir, "generated-source"),
  };
  const outputDir = path.join(outputRoot, caseId);
  await mkdir(outputDir, { recursive: true });
  detailsByCase[caseId] = await buildAuditDetailImages({
    userPath: files.user,
    outfitPath: files.outfit,
    generatedPath: files.generated,
    outputDir,
  });
  originalCases.push({ caseId, files });
}

const manifest = buildDetailManifest(originalCases, detailsByCase);
await mkdir(outputRoot, { recursive: true });
await writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  inputVariant: manifest.inputVariant,
  cases: manifest.cases.length,
  detailImages: manifest.cases.reduce((total, item) => total + Object.keys(item.detailFiles).length, 0),
}));
