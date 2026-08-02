import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { AUDIT_WORKFLOW } from "../src/audit-source-catalog.mjs";
import { runAuditCase } from "../src/audit-workflow-runner.mjs";
import { closeWorkflowPage, openWorkflowPage } from "../src/coze-cdp.mjs";

const manifestPath = resolve(process.argv[2] || "work/crop-experiment/manifest.json");
const outputPath = resolve(process.argv[3] || "work/crop-contact-sheet-v1-predictions.json");
const limit = Math.max(1, Number(process.argv[4] || 2));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const cases = manifest.cases.slice(0, limit);
const existing = await readExisting(outputPath);
const byCase = new Map(existing.map((item) => [item.caseId, item]));

await mkdir(dirname(outputPath), { recursive: true });
const page = await openWorkflowPage(undefined, AUDIT_WORKFLOW.url);
try {
  for (const [index, item] of cases.entries()) {
    const result = await runAuditCase(item, {
      files: item.files,
      inputVariant: manifest.inputVariant,
      reuseOpenPage: true,
      promptVersion: "baseline-2026-07-31",
      modelId: "doubao-1.6-vision-250815",
    });
    byCase.set(item.caseId, result);
    await writeFile(outputPath, `${JSON.stringify({ results: [...byCase.values()] }, null, 2)}\n`);
    console.log(JSON.stringify({
      completed: index + 1,
      total: cases.length,
      caseId: item.caseId,
      ok: result.ok,
      inputWarmRetry: result.inputWarmRetry,
      latencyMs: result.latencyMs,
    }));
    if (!result.ok || result.inputWarmRetry) throw new Error(`crop smoke test failed for ${item.caseId}`);
  }
} finally {
  await closeWorkflowPage(page);
}

async function readExisting(filePath) {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    return parsed.results || [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}
