import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { evaluateAuditResults } from "../src/audit-evaluation.mjs";

const datasetPath = resolve(process.argv[2] || "work/audit-dataset.json");
const predictionsPath = resolve(process.argv[3] || "work/audit-predictions.json");
const outputPath = resolve(process.argv[4] || "work/audit-report.json");
const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
const predictions = JSON.parse(await readFile(predictionsPath, "utf8"));
const report = evaluateAuditResults(dataset.cases || dataset, predictions.results || predictions);
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, output: outputPath, summary: report.summary }, null, 2));
