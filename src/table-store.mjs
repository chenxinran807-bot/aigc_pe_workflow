import { extname } from "node:path";
import { spawn } from "node:child_process";

import { dedupeHeaders, displayHeader, loadCsv, makeUniqueHeaders, saveCsv } from "./csv-store.mjs";

const DEFAULT_PYTHON = "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";

export async function loadTable(path) {
  assertSupportedPath(path);
  const extension = extname(path).toLowerCase();
  if (extension === ".csv" || extension === ".tsv") return loadCsv(path);
  if (extension === ".xlsx" || extension === ".xlsm") return loadXlsx(path);
  throw new Error("暂不支持该表格格式，请使用 .csv / .tsv / .xlsx / .xlsm");
}

export async function saveTable(path, rows, headers) {
  assertSupportedPath(path);
  const extension = extname(path).toLowerCase();
  if (extension === ".csv" || extension === ".tsv") return saveCsv(path, rows, headers);
  if (extension === ".xlsx" || extension === ".xlsm") return saveXlsx(path, rows, headers);
  throw new Error("暂不支持该表格格式，请使用 .csv / .tsv / .xlsx / .xlsm");
}

function assertSupportedPath(path) {
  if (!path) throw new Error("请先填写表格路径");
  if (/^https?:\/\//i.test(path)) {
    if (/larksuite|larkoffice|feishu|bytedance\.larkoffice/i.test(path)) {
      throw new Error("暂不能直接读取飞书在线链接。请先在飞书中导出为 Excel/CSV 文件，再填写本地文件路径；如需直接读飞书链接，需要接入飞书 API 凭证。");
    }
    throw new Error("暂不支持直接读取在线链接，请下载为本地 .xlsx 或 .csv 后加载。");
  }
}

async function loadXlsx(path) {
  const script = `
import json, sys
from openpyxl import load_workbook

path = sys.argv[1]
wb = load_workbook(path, data_only=False)
ws = wb.active
rows = []
for row in ws.iter_rows(values_only=True):
    rows.append(['' if cell is None else str(cell) for cell in row])
while rows and not any(cell != '' for cell in rows[-1]):
    rows.pop()
print(json.dumps(rows, ensure_ascii=False))
`;
  const output = await runPython(script, [path]);
  const records = JSON.parse(output || "[]");
  const headers = makeUniqueHeaders(records[0] || []);
  const rows = records.slice(1).filter((record) => record.some((cell) => cell !== "")).map((record) => {
    const row = {};
    headers.forEach((header, index) => {
      row[header] = record[index] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

async function saveXlsx(path, rows, headers) {
  const finalHeaders = dedupeHeaders(headers);
  const records = [
    finalHeaders.map(displayHeader),
    ...rows.map((row) => finalHeaders.map((header) => row[header] ?? "")),
  ];
  const script = `
import json, sys
from openpyxl import load_workbook

path = sys.argv[1]
records = json.loads(sys.stdin.read())
wb = load_workbook(path)
ws = wb.active
if ws.max_row:
    ws.delete_rows(1, ws.max_row)
for row in records:
    ws.append(row)
wb.save(path)
`;
  await runPython(script, [path], JSON.stringify(records));
}

function runPython(script, args, stdin = "") {
  return new Promise((resolve, reject) => {
    const python = process.env.TRYON_PYTHON || DEFAULT_PYTHON;
    const child = spawn(python, ["-c", script, ...args], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `${python} exited with ${code}`));
    });
    child.stdin.end(stdin);
  });
}
