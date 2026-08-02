import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { AUDIT_WORKFLOW } from "../src/audit-source-catalog.mjs";
import { TARGET_DETAIL_CASE_IDS } from "../src/audit-detail-manifest.mjs";
import { runAuditCase } from "../src/audit-workflow-runner.mjs";
import { closeWorkflowPage, openWorkflowPage } from "../src/coze-cdp.mjs";

const manifestPath = resolve(process.argv[2] || "work/named-detail-experiment/manifest.json");
const outputPath = resolve(process.argv[3] || "work/named-detail-experiment/predictions.json");
const limit = Math.min(4, Math.max(1, Number(process.argv[4] || 2)));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const byId = new Map(manifest.cases.map((item) => [item.caseId, item]));
const cases = TARGET_DETAIL_CASE_IDS.slice(0, limit).map((caseId) => {
  const item = byId.get(caseId);
  if (!item) throw new Error(`missing approved target case: ${caseId}`);
  return item;
});
const existing = await readExisting(outputPath);
const byCase = new Map(existing.map((item) => [item.caseId, item]));

await mkdir(dirname(outputPath), { recursive: true });
const page = await openWorkflowPage(undefined, AUDIT_WORKFLOW.url);
try {
  for (const [index, item] of cases.entries()) {
    const result = await runAuditCase(item, {
      files: item.files,
      detailFiles: item.detailFiles,
      inputVariant: "named-detail-v1",
      reuseOpenPage: true,
      promptVersion: "baseline-plus-role-contract-v1",
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
    if (!result.ok || result.inputWarmRetry || hasEvidenceViolation(result.parsed)) {
      throw new Error(`named detail smoke stopped for ${item.caseId}`);
    }
  }
} finally {
  await closeWorkflowPage(page);
}

function hasEvidenceViolation(parsed) {
  const text = JSON.stringify(parsed || {});
  return /\[[^\]]+\]|可能|或许|或者/.test(text);
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
