import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export function caseKey(row) {
  return [
    row.user_image || "",
    row.outfit_image || "",
    row.ai_content || row["输出"] || "",
  ].join("|");
}

export async function loadNotes() {
  try {
    return JSON.parse(await readFile(notesPath(), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

export async function saveNoteRecord(record) {
  const notes = await loadNotes();
  const existing = notes[record.caseKey] || {};
  notes[record.caseKey] = {
    ...existing,
    manualNote: record.manualNote || "",
    optimizationDirection: record.optimizationDirection || "",
    changeSummary: record.changeSummary || "",
    effectConclusion: record.effectConclusion || "",
    pmIssueLocation: record.pmIssueLocation || "",
    pmSpecificIssue: record.pmSpecificIssue || "",
    pmSourceField: record.pmSourceField || "",
    pmResolutionType: record.pmResolutionType || "",
    pmApplyScope: record.pmApplyScope || "",
    techReason: record.techReason || existing.techReason || "",
    techReasonCategory: record.techReasonCategory || existing.techReasonCategory || "",
    importedFrom: record.importedFrom || existing.importedFrom || "",
    updatedAt: record.timestamp || new Date().toISOString(),
  };
  await ensureParent(notesPath());
  await writeFile(notesPath(), `${JSON.stringify(notes, null, 2)}\n`, "utf8");
  await appendLog({ type: "note_saved", ...record });
  return notes[record.caseKey];
}

export async function loadPeChanges() {
  try {
    return JSON.parse(await readFile(peChangesPath(), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function loadExperiments() {
  try {
    return JSON.parse(await readFile(experimentsPath(), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function saveExperiment(record) {
  const experiments = await loadExperiments();
  const entry = {
    id: record.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    theme: record.theme || "未命名实验",
    totalSampleSize: Number(record.totalSampleSize) || "",
    rows: Array.isArray(record.rows) ? record.rows : [],
    headers: Array.isArray(record.headers) ? record.headers : ["user_image", "outfit_image"],
  };
  const next = experiments.filter((item) => item.id !== entry.id);
  next.push(entry);
  await ensureParent(experimentsPath());
  await writeFile(experimentsPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await appendLog({ type: "experiment_saved", id: entry.id, theme: entry.theme, count: entry.rows.length });
  return entry;
}

export async function deleteExperiment(id) {
  const experiments = await loadExperiments();
  const next = experiments.filter((item) => item.id !== id);
  await ensureParent(experimentsPath());
  await writeFile(experimentsPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await appendLog({ type: "experiment_deleted", id });
  return next;
}

export async function loadTableWorkspaces() {
  try {
    return JSON.parse(await readFile(tableWorkspacesPath(), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function saveTableWorkspace(record) {
  const workspaces = await loadTableWorkspaces();
  const entry = {
    id: record.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title: record.title || record.path || "未命名表格",
    path: record.path || "",
    selectedIndex: Number.isInteger(record.selectedIndex) ? record.selectedIndex : 0,
    headers: Array.isArray(record.headers) ? record.headers : ["user_image", "outfit_image", "ai_content"],
    rows: Array.isArray(record.rows) ? record.rows : [],
    notes: record.notes || {},
    peChanges: Array.isArray(record.peChanges) ? record.peChanges : [],
  };
  const next = workspaces.filter((item) => item.id !== entry.id);
  next.push(entry);
  await ensureParent(tableWorkspacesPath());
  await writeFile(tableWorkspacesPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await appendLog({ type: "table_workspace_saved", id: entry.id, title: entry.title, count: entry.rows.length });
  return entry;
}

export async function deleteTableWorkspace(id) {
  const workspaces = await loadTableWorkspaces();
  const next = workspaces.filter((item) => item.id !== id);
  await ensureParent(tableWorkspacesPath());
  await writeFile(tableWorkspacesPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await appendLog({ type: "table_workspace_deleted", id });
  return next;
}

export async function loadEvaluations() {
  try {
    return JSON.parse(await readFile(evaluationsPath(), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function saveEvaluation(record) {
  const evaluations = await loadEvaluations();
  const entry = {
    id: record.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    theme: record.theme || "未命名评测",
    evaluationDate: record.evaluationDate || new Date().toISOString().slice(0, 10),
    totalSampleSize: Number(record.totalSampleSize) || "",
    vlmPromptVersion: record.vlmPromptVersion || "",
    generationPromptVersion: record.generationPromptVersion || "",
    rows: Array.isArray(record.rows) ? record.rows : [],
    headers: Array.isArray(record.headers) ? record.headers : [],
    summary: record.summary || {},
  };
  const next = evaluations.filter((item) => item.id !== entry.id);
  next.push(entry);
  await ensureParent(evaluationsPath());
  await writeFile(evaluationsPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await appendLog({ type: "evaluation_saved", id: entry.id, theme: entry.theme, count: entry.rows.length });
  return entry;
}

export async function deleteEvaluation(id) {
  const evaluations = await loadEvaluations();
  const next = evaluations.filter((item) => item.id !== id);
  await ensureParent(evaluationsPath());
  await writeFile(evaluationsPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await appendLog({ type: "evaluation_deleted", id });
  return next;
}

export async function savePeChange(record) {
  const changes = await loadPeChanges();
  const entry = {
    id: record.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...record,
  };
  changes.push(entry);
  await ensureParent(peChangesPath());
  await writeFile(peChangesPath(), `${JSON.stringify(changes, null, 2)}\n`, "utf8");
  await appendLog({ type: "pe_change_saved", ...entry });
  return entry;
}

export async function loadCalibrationExamples() {
  try {
    return JSON.parse(await readFile(calibrationPath(), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function saveCalibrationExample(record) {
  const examples = await loadCalibrationExamples();
  const entry = {
    id: record.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...record,
  };
  const key = `${entry.caseKey || ""}|${entry.target || ""}|${entry.humanCorrection?.manualNote || ""}`;
  const next = examples.filter((item) => `${item.caseKey || ""}|${item.target || ""}|${item.humanCorrection?.manualNote || ""}` !== key);
  next.push(entry);
  await ensureParent(calibrationPath());
  await writeFile(calibrationPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await appendLog({ type: "judge_calibration_saved", ...entry });
  return entry;
}

export function buildCalibrationPrompt(examples) {
  const useful = examples
    .filter((item) => item.humanCorrection?.manualNote || item.humanCorrection?.optimizationDirection)
    .slice(-12);
  const caseBlocks = useful.map((item, index) => {
    const zeroIssues = (item.zeroScoreIssues || [])
      .map((issue) => `${issue.dimension}: ${issue.problem || issue.note || "0分问题"}`)
      .join("；") || "无";
    return [
      `样本 ${index + 1}`,
      `人工0分维度/问题：${zeroIssues}`,
      `人工定位：${item.humanCorrection?.manualNote || "未填写"}`,
      `人工优化方向：${item.humanCorrection?.optimizationDirection || "未填写"}`,
      `AI裁判错误倾向：${summarizeAiJudgeError(item.aiJudgeResult)}`,
    ].join("\n");
  }).join("\n\n");

  return [
    "【裁判校准规则】",
    "你必须像人工评测一样抓主矛盾，先判断 VLM 是否正确，再判断 prompt 是否已经写了约束，最后判断 generated_image 是否执行了约束。",
    "",
    "1. 四个维度独立评分。不要因为面部/发型失败，就把姿势、服装、背景也一起判 0。",
    "2. 如果人工问题是“短发变长发/发型被模特污染/头肩比例失调/头太大”，优先归入“面部特征与妆造发型还原”。",
    "3. 如果 user_vlm 和 outfit_vlm 都正确，prompt 也已经包含正确约束，但生成图没有做到，归因应是“模型生成能力问题”或“prompt表述不够符合模型理解”，不是 VLM 错误。",
    "4. 如果 prompt 已经包含负向打压，如“图2原模特的长发披散/露额头”，但生成图仍把用户短发变成长发，优化建议应优先尝试改写发型保留与模特发型打压；多轮无效后再建议工程化消除模特图发型影响。",
    "5. 只有在图片中有明确证据时才扣其他维度。服装、姿势、背景基本正确时，应给 1 或 2，不能泛化扣 0。",
    "6. 输出证据必须同时引用图像观察和 prompt/VLM 文本证据。没有证据就降低置信度，不要编造细节。",
    "",
    useful.length ? "【已积累人工校准样本】" : "【已积累人工校准样本】暂无。请先在页面保存人工校准样本。",
    caseBlocks,
  ].filter(Boolean).join("\n");
}

function summarizeAiJudgeError(text = "") {
  if (!text) return "未记录";
  const lines = text.split("\n").filter((line) => /分|归因|优化|问题|VLM|Prompt/.test(line));
  return (lines.slice(0, 8).join("；") || text).slice(0, 700);
}

export async function appendLog(record) {
  await ensureParent(logPath());
  const entry = {
    timestamp: new Date().toISOString(),
    ...record,
  };
  await appendFile(logPath(), `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

export async function readLogs(limit = 200) {
  try {
    const text = await readFile(logPath(), "utf8");
    return text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .slice(-limit)
      .reverse();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function ensureParent(path) {
  await mkdir(dirname(path), { recursive: true });
}

function dataDir() {
  return process.env.TRYON_DATA_DIR || join(__dirname, "..", "data");
}

function notesPath() {
  return join(dataDir(), "case-notes.json");
}

function logPath() {
  return join(dataDir(), "prompt-change-log.jsonl");
}

function calibrationPath() {
  return join(dataDir(), "judge-calibration-examples.json");
}

function peChangesPath() {
  return join(dataDir(), "pe-change-records.json");
}

function experimentsPath() {
  return join(dataDir(), "experiments.json");
}

function tableWorkspacesPath() {
  return join(dataDir(), "table-workspaces.json");
}

function evaluationsPath() {
  return join(dataDir(), "evaluations.json");
}
