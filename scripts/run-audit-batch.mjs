import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { AUDIT_WORKFLOW } from "../src/audit-source-catalog.mjs";
import { runAuditCase } from "../src/audit-workflow-runner.mjs";
import { closeWorkflowPage, openWorkflowPage } from "../src/coze-cdp.mjs";

const datasetPath = resolve(process.argv[2] || "work/audit-dataset.json");
const outputPath = resolve(process.argv[3] || "work/audit-predictions.json");
const limit = Math.max(1, Number(process.argv[4] || 20));
const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
const cases = (dataset.cases || dataset).slice(0, limit);
const results = [];

await mkdir(dirname(outputPath), { recursive: true });
const page = await openWorkflowPage(undefined, AUDIT_WORKFLOW.url);
try {
  for (const [index, item] of cases.entries()) {
    const result = await runAuditCase(item, {
      reuseOpenPage: true,
      promptVersion: process.env.AUDIT_PROMPT_VERSION || "baseline-2026-07-31",
      modelId: process.env.AUDIT_MODEL_ID || "doubao-1.8-deep-thinking",
    });
    results.push(result);
    await writeFile(outputPath, `${JSON.stringify({ results }, null, 2)}\n`);
    console.log(JSON.stringify({
      completed: index + 1,
      total: cases.length,
      caseId: item.caseId,
      ok: result.ok,
      latencyMs: result.latencyMs,
    }));
  }
} finally {
  await closeWorkflowPage(page);
}
