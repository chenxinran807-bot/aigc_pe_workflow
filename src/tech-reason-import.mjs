import { spawn } from "node:child_process";

import { caseKey, loadNotes, saveNoteRecord } from "./log-store.mjs";

const DEFAULT_PYTHON = "/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";

export async function importTechReasons({ xlsxPath, rows }) {
  const sourceRows = await readXlsxRows(xlsxPath);
  const importMap = buildTechReasonMap(sourceRows);
  const notes = await loadNotes();
  const imported = [];
  const missing = [];

  for (const [index, row] of (rows || []).entries()) {
    const contentUrl = normalizeUrl(contentUrlFromRow(row));
    const source = importMap.get(contentUrl);
    if (!source) {
      missing.push({ index: index + 1, aiContent: contentUrl });
      continue;
    }
    const existing = notes[caseKey(row)] || {};
    const techReason = source["技术原因"] || "";
    const problemType = source["问题类型"] || "";
    const attributionNote = source["归因备注"] || "";
    const record = {
      caseKey: caseKey(row),
      caseIndex: index + 1,
      csvPath: "",
      issue: { title: problemType, note: attributionNote },
      userImage: row.user_image || "",
      outfitImage: row.outfit_image || "",
      originalContent: row.ai_content || row["输出"] || "",
      manualNote: existing.manualNote || [problemType, attributionNote].filter(Boolean).join(" / "),
      optimizationDirection: existing.optimizationDirection || techReason,
      changeSummary: existing.changeSummary || "",
      effectConclusion: existing.effectConclusion || "",
      pmIssueLocation: existing.pmIssueLocation || inferIssueLocation(techReason),
      pmSpecificIssue: existing.pmSpecificIssue || techReason,
      pmSourceField: existing.pmSourceField || "v5-badcase技术原因定位.xlsx: 技术原因",
      pmResolutionType: existing.pmResolutionType || inferResolutionType(techReason),
      pmApplyScope: existing.pmApplyScope || "cluster",
      techReason,
      techReasonCategory: normalizeTechReasonCategory(techReason),
      importedFrom: xlsxPath,
      timestamp: new Date().toISOString(),
    };
    await saveNoteRecord(record);
    imported.push({ index: index + 1, aiContent: contentUrl, techReason, category: record.techReasonCategory });
  }

  return {
    sourceCount: sourceRows.length,
    importedCount: imported.length,
    missingCount: missing.length,
    imported,
    missing: missing.slice(0, 20),
    notes: await loadNotes(),
  };
}

export function buildTechReasonMap(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const contentUrl = normalizeUrl(row.ai_content || row.aiContent || row["ai_content"]);
    const techReason = String(row["技术原因"] || "").trim();
    if (!contentUrl || !techReason) continue;
    map.set(contentUrl, row);
  }
  return map;
}

export function normalizeTechReasonCategory(reason) {
  const text = String(reason || "").replace(/\s+/g, "");
  if (!text) return "未分类技术原因";
  const parts = [];
  if (/用户\s*VLM|user[_\s-]*vlm/i.test(text)) parts.push("用户VLM");
  if (/搭配\s*VLM|outfit[_\s-]*vlm/i.test(text)) parts.push("搭配VLM");
  if (/prompt|提示词|负向|正向/i.test(text)) parts.push("Prompt");
  if (/模型理解/.test(text)) parts.push("模型理解");
  if (/模型能力|生图能力|模型生成/.test(text)) parts.push("模型能力");
  if (/工程|链路|前处理|后处理|裁剪|抠图|消除/.test(text)) parts.push("工程链路");
  const issue = [
    [/穿模|穿帮/, "穿模/穿帮"],
    [/长发|短发|发型|头发|刘海|发色/, "发型污染"],
    [/头肩|头身|比例|头大/, "比例异常"],
    [/肤色|妆容|五官|脸|身份/, "面部还原"],
    [/姿势|肢体|手|脚|动作/, "姿势肢体"],
    [/服装|衣服|款式|颜色|材质|图案|版型|包|鞋/, "服装特征"],
    [/背景|场景|水印|物件|幻觉/, "背景幻觉"],
  ].find(([pattern]) => pattern.test(text))?.[1];
  if (issue) parts.push(issue);
  return parts.length ? [...new Set(parts)].join(" + ") : String(reason).slice(0, 32);
}

function inferIssueLocation(reason) {
  const text = String(reason || "");
  if (/用户\s*VLM|user[_\s-]*vlm/i.test(text)) return "用户 VLM";
  if (/搭配\s*VLM|outfit[_\s-]*vlm/i.test(text)) return "搭配 VLM";
  if (/prompt|提示词|负向|正向/i.test(text)) return "生图 Prompt";
  if (/模型理解/.test(text)) return "模型理解能力";
  if (/模型|生图/.test(text)) return "模型生图能力";
  if (/工程|链路|前处理|后处理|裁剪|抠图|消除/.test(text)) return "工程链路";
  return "生图 Prompt";
}

function inferResolutionType(reason) {
  const text = String(reason || "");
  if (/用户\s*VLM|user[_\s-]*vlm/i.test(text)) return "修改用户 VLM";
  if (/搭配\s*VLM|outfit[_\s-]*vlm/i.test(text)) return "修改搭配 VLM";
  if (/prompt|提示词|负向|正向/i.test(text)) return "修改生图 Prompt";
  if (/工程|链路|前处理|后处理|裁剪|抠图|消除/.test(text)) return "转工程";
  if (/模型/.test(text)) return "记录模型能力问题";
  return "修改生图 Prompt";
}

function contentUrlFromRow(row) {
  return row?.ai_content || parseJsonField(row?.["输出"])?.content || row?.["输出"] || "";
}

function parseJsonField(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return null;
  }
}

function normalizeUrl(value) {
  const text = String(value || "").trim();
  const match = text.match(/https?:\/\/[^\s"'，,}]+/);
  return match ? match[0] : text;
}

async function readXlsxRows(xlsxPath) {
  const python = process.env.TRYON_PYTHON || DEFAULT_PYTHON;
  const script = `
import json, re, sys, zipfile
from xml.etree import ElementTree as ET

path = sys.argv[1]
ns = {'a': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def col_index(cell_ref):
    letters = re.sub(r'[^A-Z]', '', cell_ref or '')
    total = 0
    for ch in letters:
        total = total * 26 + ord(ch) - 64
    return total - 1

def text_of(node):
    return ''.join(node.itertext()) if node is not None else ''

with zipfile.ZipFile(path) as z:
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        root = ET.fromstring(z.read('xl/sharedStrings.xml'))
        shared = [text_of(si) for si in root.findall('a:si', ns)]
    sheet_name = 'xl/worksheets/sheet1.xml'
    root = ET.fromstring(z.read(sheet_name))
    table = []
    for row in root.findall('.//a:sheetData/a:row', ns):
        values = {}
        max_col = -1
        for c in row.findall('a:c', ns):
            idx = col_index(c.attrib.get('r', ''))
            max_col = max(max_col, idx)
            t = c.attrib.get('t')
            if t == 'inlineStr':
                value = text_of(c.find('a:is', ns))
            else:
                raw = text_of(c.find('a:v', ns))
                value = shared[int(raw)] if t == 's' and raw else raw
            values[idx] = value
        table.append([values.get(i, '') for i in range(max_col + 1)])
headers = [str(x).strip() for x in table[0]] if table else []
rows = []
for line in table[1:]:
    item = {headers[i]: line[i] if i < len(line) else '' for i in range(len(headers))}
    if any(str(v).strip() for v in item.values()):
        rows.append(item)
print(json.dumps(rows, ensure_ascii=False))
`;
  const output = await runProcess(python, ["-c", script, xlsxPath]);
  return JSON.parse(output || "[]");
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `${command} exited with ${code}`));
    });
  });
}
