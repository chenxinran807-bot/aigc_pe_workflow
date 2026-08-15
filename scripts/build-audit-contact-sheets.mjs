import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildAuditContactSheet } from "../src/audit-contact-sheet.mjs";

const sourcePath = path.resolve(process.argv[2] || "work/model-comparison-set.json");
const outputRoot = path.resolve(process.argv[3] || "work/crop-experiment");
const limit = Math.max(1, Number(process.argv[4] || Number.MAX_SAFE_INTEGER));
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const cases = (source.cases || source).slice(0, limit);
const manifest = { createdAt: new Date().toISOString(), inputVariant: "contact-sheet-v1", cases: [] };

for (const [index, item] of cases.entries()) {
  const caseDirectory = path.join(outputRoot, safeSegment(item.caseId));
  await mkdir(caseDirectory, { recursive: true });
  const files = {};
  for (const role of ["user", "outfit", "generated"]) {
    const sourceFile = path.join(caseDirectory, `${role}-source`);
    const outputFile = path.join(caseDirectory, `${role}-contact-sheet.jpg`);
    await downloadImage(item.images[role], sourceFile);
    await buildAuditContactSheet({ inputPath: sourceFile, outputPath: outputFile });
    files[role] = outputFile;
  }
  manifest.cases.push({ ...item, files });
  console.log(JSON.stringify({ completed: index + 1, total: cases.length, caseId: item.caseId }));
}

await writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, cases: manifest.cases.length, output: path.join(outputRoot, "manifest.json") }));

async function downloadImage(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`image download failed with status ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 30 * 1024 * 1024) throw new Error("image download size is invalid");
  await writeFile(outputPath, bytes);
}

function safeSegment(value) {
  return String(value || "case").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}
