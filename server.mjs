import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { tmpdir } from "node:os";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadTable, saveTable } from "./src/table-store.mjs";
import { normalizeCaseTable } from "./src/case-table-normalizer.mjs";
import { applyPromptEdits, getPromptSnapshot, runCaseAndWait, runCaseInNewWorkflowPage } from "./src/coze-automation.mjs";
import { runJudge } from "./src/judge-automation.mjs";
import { appendLog, buildCalibrationPrompt, deleteEvaluation, deleteExperiment, deleteTableWorkspace, loadCalibrationExamples, loadEvaluations, loadExperiments, loadNotes, loadPeChanges, loadTableWorkspaces, readLogs, saveCalibrationExample, saveEvaluation, saveExperiment, saveNoteRecord, savePeChange, saveTableWorkspace } from "./src/log-store.mjs";
import { judgeBatch, judgeCase } from "./src/local-judge.mjs";
import { judgeMultimodalBatch, multimodalJudgeConfig } from "./src/multimodal-judge.mjs";
import { runWithTransientRetry } from "./src/coze-retry.mjs";
import { cozeWorkflowConcurrency, runWithConcurrency } from "./src/rerun-scheduler.mjs";
import { importTechReasons } from "./src/tech-reason-import.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 5177);
const host = process.env.HOST || "127.0.0.1";

const server = createServer(async (request, response) => {
  try {
    if (apiPathname(request)) {
      await handleApi(request, response);
      return;
    }
    await serveStatic(request, response);
  } catch (error) {
    sendJson(response, 500, { ok: false, error: error.message || String(error) });
  }
});

server.listen(port, host, () => {
  console.log(`Try-on badcase review tool: http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`);
  if (host === "0.0.0.0") {
    for (const address of lanAddresses()) console.log(`LAN access: http://${address}:${port}`);
  }
});

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
}

async function handleApi(request, response) {
  const pathname = apiPathname(request);

  if (request.method === "POST" && pathname === "/api/load-csv") {
    const body = await readJson(request);
    const table = normalizeCaseTable(await loadTable(body.path));
    sendJson(response, 200, { ok: true, ...table, path: body.path, notes: await loadNotes(), peChanges: await loadPeChanges() });
    return;
  }

  if (request.method === "POST" && pathname === "/api/load-table-file") {
    const body = await readJson(request);
    const table = normalizeCaseTable(await loadUploadedTableFile(body));
    sendJson(response, 200, { ok: true, ...table, path: body.filename || "uploaded-table", notes: await loadNotes(), peChanges: await loadPeChanges() });
    return;
  }

  if (request.method === "POST" && pathname === "/api/save-runs") {
    const body = await readJson(request);
    const headers = mergeHeaders(body.headers || [], body.rows || []);
    await saveTable(body.path, body.rows || [], headers);
    sendJson(response, 200, { ok: true, headers });
    return;
  }

  if (request.method === "GET" && pathname === "/api/experiments/list") {
    sendJson(response, 200, { ok: true, experiments: await loadExperiments() });
    return;
  }

  if (request.method === "GET" && pathname === "/api/table-workspaces/list") {
    sendJson(response, 200, { ok: true, tableWorkspaces: await loadTableWorkspaces() });
    return;
  }

  if (request.method === "POST" && pathname === "/api/table-workspaces/save") {
    const body = await readJson(request);
    const tableWorkspace = await saveTableWorkspace(body.tableWorkspace || {});
    sendJson(response, 200, { ok: true, tableWorkspace, tableWorkspaces: await loadTableWorkspaces() });
    return;
  }

  if (request.method === "POST" && pathname === "/api/table-workspaces/delete") {
    const body = await readJson(request);
    sendJson(response, 200, { ok: true, tableWorkspaces: await deleteTableWorkspace(body.id || "") });
    return;
  }

  if (request.method === "POST" && pathname === "/api/experiments/save") {
    const body = await readJson(request);
    const experiment = await saveExperiment(body.experiment || {});
    sendJson(response, 200, { ok: true, experiment, experiments: await loadExperiments() });
    return;
  }

  if (request.method === "POST" && pathname === "/api/experiments/delete") {
    const body = await readJson(request);
    sendJson(response, 200, { ok: true, experiments: await deleteExperiment(body.id || "") });
    return;
  }

  if (request.method === "GET" && pathname === "/api/evaluations/list") {
    sendJson(response, 200, { ok: true, evaluations: await loadEvaluations() });
    return;
  }

  if (request.method === "POST" && pathname === "/api/evaluations/save") {
    const body = await readJson(request);
    const evaluation = await saveEvaluation(body.evaluation || {});
    sendJson(response, 200, { ok: true, evaluation, evaluations: await loadEvaluations() });
    return;
  }

  if (request.method === "POST" && pathname === "/api/evaluations/delete") {
    const body = await readJson(request);
    sendJson(response, 200, { ok: true, evaluations: await deleteEvaluation(body.id || "") });
    return;
  }

  if (request.method === "GET" && pathname === "/api/coze/prompts") {
    sendJson(response, 200, { ok: true, prompts: await getPromptSnapshot() });
    return;
  }

  if (request.method === "POST" && pathname === "/api/coze/apply-prompts") {
    const body = await readJson(request);
    const result = await applyPromptEdits(body.prompts || {});
    if (body.log) {
      await appendLog({
        type: "prompt_applied",
        ...body.log,
        promptsAfter: body.prompts || {},
      });
    }
    sendJson(response, 200, { ok: true, result });
    return;
  }

  if (request.method === "POST" && pathname === "/api/coze/run-case") {
    const body = await readJson(request);
    const result = await runOneCase(body, 1);
    if (body.log) {
      await appendLog({
        type: "case_rerun",
        ...body.log,
        result,
      });
    }
    sendJson(response, 200, { ok: true, result });
    return;
  }

  if (request.method === "POST" && pathname === "/api/coze/run-case-batch") {
    const body = await readJson(request);
    const caseResult = await runCaseMany({
      caseItem: { clientIndex: body.clientIndex ?? 0, user_image: body.user_image, outfit_image: body.outfit_image, log: body.log },
      count: body.count,
      timeoutMs: body.timeoutMs,
    });
    sendJson(response, 200, { ok: true, results: caseResult.results, caseResults: [caseResult] });
    return;
  }

  if (request.method === "POST" && pathname === "/api/coze/run-cases-batch") {
    const body = await readJson(request);
    const cases = Array.isArray(body.cases) ? body.cases : [];
    const caseResults = await runCasesParallel({
      cases,
      count: body.count,
      timeoutMs: body.timeoutMs,
      concurrency: body.concurrency,
    });
    sendJson(response, 200, { ok: true, caseResults });
    return;
  }

  if (request.method === "POST" && pathname === "/api/coze/judge-case") {
    const body = await readJson(request);
    const result = await runJudge(body.payload || {}, { timeoutMs: body.timeoutMs });
    if (body.log) {
      await appendLog({
        type: "ai_judge",
        ...body.log,
        result,
      });
    }
    sendJson(response, 200, { ok: true, result });
    return;
  }

  if (request.method === "POST" && pathname === "/api/local-judge/case") {
    const body = await readJson(request);
    const result = judgeCase(body.payload || {});
    if (body.log) {
      await appendLog({ type: "local_ai_judge", ...body.log, result });
    }
    sendJson(response, 200, { ok: true, result });
    return;
  }

  if (request.method === "POST" && pathname === "/api/local-judge/batch") {
    const body = await readJson(request);
    const report = judgeBatch(Array.isArray(body.items) ? body.items : []);
    if (body.log) {
      await appendLog({ type: "local_ai_judge_batch", ...body.log, report });
    }
    sendJson(response, 200, { ok: true, report });
    return;
  }

  if (request.method === "GET" && pathname === "/api/multimodal-judge/config") {
    const config = multimodalJudgeConfig();
    sendJson(response, 200, {
      ok: true,
      configured: Boolean(config.apiKey && config.model),
      baseUrl: config.baseUrl,
      model: config.model,
      missing: [
        config.apiKey ? "" : "JUDGE_API_KEY 或 OPENAI_API_KEY",
        config.model ? "" : "JUDGE_MODEL 或 OPENAI_MODEL",
      ].filter(Boolean),
    });
    return;
  }

  if (request.method === "POST" && pathname === "/api/multimodal-judge/batch") {
    const body = await readJson(request);
    const report = await judgeMultimodalBatch(Array.isArray(body.items) ? body.items : []);
    if (body.log) {
      await appendLog({ type: "multimodal_ai_judge_batch", ...body.log, report });
    }
    sendJson(response, 200, { ok: true, report });
    return;
  }

  if (request.method === "POST" && pathname === "/api/notes/save") {
    const body = await readJson(request);
    sendJson(response, 200, { ok: true, note: await saveNoteRecord(body.record || {}) });
    return;
  }

  if (request.method === "POST" && pathname === "/api/tech-reasons/import") {
    const body = await readJson(request);
    const result = await importTechReasons({ xlsxPath: body.xlsxPath, rows: body.rows || [] });
    sendJson(response, 200, { ok: true, ...result });
    return;
  }

  if (request.method === "POST" && pathname === "/api/pe-change/save") {
    const body = await readJson(request);
    const change = await savePeChange(body.record || {});
    sendJson(response, 200, { ok: true, change, peChanges: await loadPeChanges() });
    return;
  }

  if (request.method === "GET" && pathname === "/api/pe-change/list") {
    sendJson(response, 200, { ok: true, peChanges: await loadPeChanges() });
    return;
  }

  if (request.method === "POST" && pathname === "/api/judge-calibration/save") {
    const body = await readJson(request);
    await saveCalibrationExample(body.record || {});
    const examples = await loadCalibrationExamples();
    sendJson(response, 200, { ok: true, count: examples.length, prompt: buildCalibrationPrompt(examples) });
    return;
  }

  if (request.method === "GET" && pathname === "/api/judge-calibration/prompt") {
    const examples = await loadCalibrationExamples();
    sendJson(response, 200, { ok: true, count: examples.length, prompt: buildCalibrationPrompt(examples) });
    return;
  }

  if (request.method === "GET" && pathname === "/api/logs") {
    sendJson(response, 200, { ok: true, logs: await readLogs() });
    return;
  }

  sendJson(response, 404, { ok: false, error: "Unknown API endpoint" });
}

function apiPathname(request) {
  const { pathname } = new URL(request.url, `http://${request.headers.host}`);
  const index = pathname.indexOf("/api/");
  return index >= 0 ? pathname.slice(index) : "";
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const fullPath = resolve(publicDir, `.${pathname}`);
  if (!fullPath.startsWith(publicDir)) {
    sendText(response, 403, "Forbidden");
    return;
  }
  const content = await readFile(fullPath);
  response.writeHead(200, { "content-type": contentType(fullPath) });
  response.end(content);
}

async function runOneCase(body, runIndex, options = {}) {
  const promptFallback = formatPromptsUsed(body.promptsUsed);
  try {
    const run = options.isolatedPage ? runCaseInNewWorkflowPage : runCaseAndWait;
    const result = await runWithTransientRetry(() => run({
      userImage: body.user_image,
      outfitImage: body.outfit_image,
      timeoutMs: body.timeoutMs || 180000,
    }), { attempts: options.isolatedPage ? 2 : 1, delayMs: 1200 });
    return { ...result, prompt: result.prompt || promptFallback, runIndex };
  } catch (error) {
    return {
      runIndex,
      timestamp: new Date().toISOString(),
      content: "",
      prompt: promptFallback,
      rawOutput: "",
      error: error.message || String(error),
    };
  }
}

async function runCasesParallel({ cases, count, timeoutMs, concurrency }) {
  const finalCount = Math.max(1, Math.min(20, Number(count) || 1));
  const finalConcurrency = cozeWorkflowConcurrency({
    requested: concurrency,
    casesCount: cases.length,
    runCount: finalCount,
  });
  const grouped = new Map(cases.map((caseItem) => [caseItem.clientIndex, {
    clientIndex: caseItem.clientIndex,
    results: [],
  }]));
  const tasks = [];

  for (const caseItem of cases) {
    for (let index = 0; index < finalCount; index += 1) {
      const runIndex = index + 1;
      tasks.push(async () => {
        const result = await runOneCase({
          user_image: caseItem.user_image,
          outfit_image: caseItem.outfit_image,
          timeoutMs,
          promptsUsed: caseItem.promptsUsed,
        }, runIndex, { isolatedPage: true });
        if (caseItem.log) {
          await appendLog({
            type: "case_rerun",
            batchIndex: runIndex,
            batchCount: finalCount,
            parallel: true,
            ...caseItem.log,
            result,
          });
        }
        return { clientIndex: caseItem.clientIndex, result };
      });
    }
  }

  const taskResults = await runWithConcurrency(tasks, finalConcurrency);
  for (const taskResult of taskResults) {
    const group = grouped.get(taskResult.clientIndex);
    if (group) group.results.push(taskResult.result);
  }
  for (const group of grouped.values()) {
    group.results.sort((a, b) => (a.runIndex || 0) - (b.runIndex || 0));
  }
  return [...grouped.values()];
}

async function runCaseMany({ caseItem, count, timeoutMs }) {
  const finalCount = Math.max(1, Math.min(20, Number(count) || 1));
  const results = [];
  for (let index = 0; index < finalCount; index += 1) {
    const result = await runOneCase({
      user_image: caseItem.user_image,
      outfit_image: caseItem.outfit_image,
      timeoutMs,
      promptsUsed: caseItem.promptsUsed,
    }, index + 1);
    results.push(result);
    if (caseItem.log) {
      await appendLog({
        type: "case_rerun",
        batchIndex: index + 1,
        batchCount: finalCount,
        ...caseItem.log,
        result,
      });
    }
  }
  return {
    clientIndex: caseItem.clientIndex,
    results,
  };
}

async function loadUploadedTableFile(body) {
  if (!body?.contentBase64) throw new Error("请先选择要上传的表格文件");
  const filename = basename(body.filename || "uploaded.csv");
  const extension = extname(filename).toLowerCase();
  if (![".csv", ".tsv", ".xlsx", ".xlsm"].includes(extension)) {
    throw new Error("暂不支持该文件格式，请上传 .csv / .tsv / .xlsx / .xlsm");
  }
  const dir = await mkdtemp(join(tmpdir(), "tryon-upload-"));
  const path = join(dir, filename || `uploaded${extension || ".csv"}`);
  try {
    await writeFile(path, Buffer.from(body.contentBase64, "base64"));
    return await loadTable(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function formatPromptsUsed(prompts = {}) {
  const sections = [
    ["User VLM 系统提示词", prompts.userSystemPrompt],
    ["User VLM Prompt", prompts.userPrompt],
    ["Outfit VLM 系统提示词", prompts.outfitSystemPrompt],
    ["Outfit VLM Prompt", prompts.outfitPrompt],
    ["生图 Prompt 拼接代码", prompts.promptCode],
  ].filter(([, value]) => value);
  return sections.map(([title, value]) => `## ${title}\n${value}`).join("\n\n");
}

function mergeHeaders(headers, rows) {
  const merged = [...headers];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!merged.includes(key)) merged.push(key);
    }
  }
  return merged;
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function sendText(response, status, value) {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(value);
}

function contentType(path) {
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
  }[extname(path)] || "application/octet-stream";
}
