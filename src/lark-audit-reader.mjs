import { spawn } from "node:child_process";

import { dedupeCases, normalizeWorkbookPayload } from "./audit-dataset.mjs";

export async function readAuditSource(source, options = {}) {
  const payload = await runLarkCli([
    "sheets",
    "+table-get",
    "--url",
    source.url,
    "--no-header",
    "--as",
    "user",
  ], options);
  return normalizeWorkbookPayload(withFirstRowAsHeaders(payload), source);
}

export async function readAuditSources(sources, options = {}) {
  const allCases = [];
  const reports = [];
  for (const source of sources) {
    const result = await readAuditSource(source, options);
    allCases.push(...result.cases);
    reports.push({
      sourceId: source.sourceId,
      caseCount: result.cases.length,
      skippedSheets: result.skippedSheets,
    });
  }
  return { cases: dedupeCases(allCases), sources: reports };
}

function withFirstRowAsHeaders(payload) {
  const sheets = payload?.data?.sheets || [];
  return {
    ...payload,
    data: {
      ...payload.data,
      sheets: sheets.map((sheet) => ({
        ...sheet,
        columns: (sheet.data?.[0] || []).map((value) => String(value ?? "").trim()),
        data: (sheet.data || []).slice(1),
      })),
    },
  };
}

function runLarkCli(args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(options.bin || "lark-cli", args, {
      env: {
        ...process.env,
        LARKSUITE_CLI_NO_UPDATE_NOTIFIER: "1",
        LARKSUITE_CLI_NO_SKILLS_NOTIFIER: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `lark-cli exited with ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("lark-cli returned invalid JSON"));
      }
    });
  });
}
